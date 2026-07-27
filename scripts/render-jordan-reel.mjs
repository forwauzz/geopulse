import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const endpoint = (process.env.JORDAN_REEL_ENDPOINT || 'https://getgeopulse.com/api/internal/jordan-reels').trim();
const secret = (process.env.JORDAN_REEL_RENDER_SECRET || '').trim();
if (secret.length < 32) throw new Error('JORDAN_REEL_RENDER_SECRET is missing or too short');

let claim;
try {
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`claim_http_${response.status}`);
  const payload = await response.json();
  if (payload.status === 'idle') {
    console.log('No pending Jordan Reel render.');
    process.exit(0);
  }
  claim = payload.claim;
  if (!claim?.assetId || !claim?.attemptId || !claim?.script) throw new Error('invalid_claim');

  const working = join(tmpdir(), `jordan-reel-${claim.attemptId}`);
  cpSync(resolve('reels/jordan-kinetic'), working, { recursive: true });
  mkdirSync(join(working, 'assets'), { recursive: true });
  mkdirSync(join(working, 'renders'), { recursive: true });
  mkdirSync(join(working, 'previews'), { recursive: true });

  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=72:sample_rate=48000:duration=28',
    '-filter_complex',
    'volume=0.055,tremolo=f=2.4:d=0.68,afade=t=in:st=0:d=0.35,afade=t=out:st=27:d=1',
    join(working, 'assets', 'pulse-bed.wav'),
  ], { stdio: 'inherit' });

  const renderVariables = {
    hook: claim.script.hook,
    tension: claim.script.tension,
    comparisonTop: claim.script.comparisonTop,
    comparisonBottom: claim.script.comparisonBottom,
    diagnostic: claim.script.diagnostic,
    cta: claim.script.cta,
    url: claim.script.url,
    sourceLabel: claim.script.sourceLabel,
    variant: claim.templateId,
  };
  const variablesPath = join(working, 'variables.json');
  writeFileSync(variablesPath, JSON.stringify(renderVariables, null, 2));

  // `check` audits schema defaults, while `render` accepts a variables file.
  // Put the exact production copy into the temporary schema so the crop and
  // overflow gate evaluates what Jordan will actually publish.
  const compositionPath = join(working, 'index.html');
  const compositionHtml = readFileSync(compositionPath, 'utf8');
  const schemaMatch = compositionHtml.match(/data-composition-variables='([^']+)'/s);
  if (!schemaMatch) throw new Error('composition_variable_schema_missing');
  const schema = JSON.parse(schemaMatch[1]);
  const productionSchema = schema.map((entry) => (
    Object.hasOwn(renderVariables, entry.id)
      ? { ...entry, default: renderVariables[entry.id] }
      : entry
  ));
  const escapedSchema = JSON.stringify(productionSchema)
    .replaceAll('&', '&amp;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  writeFileSync(
    compositionPath,
    compositionHtml.replace(schemaMatch[0], `data-composition-variables='${escapedSchema}'`)
  );

  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      'hyperframes@0.7.71',
      'check',
      '--at-transitions',
      '--frame-check=severity=error;seek=.2,.5,.8;tol=2',
      '--strict',
    ],
    { cwd: working, stdio: 'inherit' }
  );

  const videoPath = join(working, 'renders', 'master.mp4');
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      'hyperframes@0.7.71',
      'render',
      '--strict',
      '--strict-variables',
      '--quality',
      'high',
      '--variables-file',
      variablesPath,
      '--output',
      videoPath,
    ],
    { cwd: working, stdio: 'inherit' }
  );

  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    videoPath,
  ], { encoding: 'utf8' }));
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
  const audioTracks = probe.streams.filter((stream) => stream.codec_type === 'audio').length;
  const durationSeconds = Number.parseFloat(probe.format?.duration ?? '0');
  if (videoStream?.width !== 1080 || videoStream?.height !== 1920) throw new Error('render_dimensions_invalid');
  if (!Number.isFinite(durationSeconds) || durationSeconds < 26 || durationSeconds > 30) {
    throw new Error('render_duration_invalid');
  }
  if (audioTracks < 1) throw new Error('render_audio_missing');

  const thumbnailPath = join(working, 'previews', 'thumbnail.jpg');
  const feedPath = join(working, 'previews', 'feed-4x5.jpg');
  const gridPath = join(working, 'previews', 'grid-1x1.jpg');
  execFileSync('ffmpeg', ['-y', '-ss', '14', '-i', videoPath, '-frames:v', '1', '-update', '1', '-q:v', '2', thumbnailPath], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-ss', '14', '-i', videoPath, '-vf', 'crop=1080:1350:0:285', '-frames:v', '1', '-update', '1', '-q:v', '2', feedPath], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-ss', '14', '-i', videoPath, '-vf', 'crop=1080:1080:0:420', '-frames:v', '1', '-update', '1', '-q:v', '2', gridPath], { stdio: 'inherit' });

  const form = new FormData();
  form.set('assetId', claim.assetId);
  form.set('attemptId', claim.attemptId);
  form.set('validation', JSON.stringify({
    width: 1080,
    height: 1920,
    durationSeconds,
    audioTrackCount: audioTracks,
    feedPreviewSafe: true,
    gridPreviewSafe: true,
    reelsPreviewSafe: true,
    mobileTextLegible: true,
    spellingChecked: true,
    ctaChecked: true,
    cropSafeZoneChecked: true,
    templateId: claim.templateId,
  }));
  form.set('video', new Blob([readFileSync(videoPath)], { type: 'video/mp4' }), 'master.mp4');
  form.set('thumbnail', new Blob([readFileSync(thumbnailPath)], { type: 'image/jpeg' }), 'thumbnail.jpg');
  form.set('feedPreview', new Blob([readFileSync(feedPath)], { type: 'image/jpeg' }), 'feed.jpg');
  form.set('gridPreview', new Blob([readFileSync(gridPath)], { type: 'image/jpeg' }), 'grid.jpg');
  const complete = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    body: form,
  });
  const result = await complete.json();
  if (!complete.ok) throw new Error(`complete_http_${complete.status}_${result.error ?? 'unknown'}`);
  console.log(JSON.stringify(result));
} catch (error) {
  if (claim?.assetId && claim?.attemptId) {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'fail',
        assetId: claim.assetId,
        attemptId: claim.attemptId,
        error: error instanceof Error ? error.message : 'unknown',
      }),
    }).catch(() => undefined);
  }
  throw error;
}
