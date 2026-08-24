param(
  [string]$OutputDir = "output/social-samples/2026-08-01-client-geo-carousel"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $out | Out-Null

$W = 1080
$H = 1350
$ink = [System.Drawing.ColorTranslator]::FromHtml('#2C3435')
$secondary = [System.Drawing.ColorTranslator]::FromHtml('#586162')
$slate = [System.Drawing.ColorTranslator]::FromHtml('#565E74')
$ivory = [System.Drawing.ColorTranslator]::FromHtml('#F5F2E8')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#F8F9F9')
$gold = [System.Drawing.ColorTranslator]::FromHtml('#B79C60')
$darkGold = [System.Drawing.ColorTranslator]::FromHtml('#8A6D33')
$errorColor = [System.Drawing.ColorTranslator]::FromHtml('#9F403D')
$dark = [System.Drawing.ColorTranslator]::FromHtml('#090D12')
$darkSurface = [System.Drawing.ColorTranslator]::FromHtml('#151D27')
$darkText = [System.Drawing.ColorTranslator]::FromHtml('#E6EBEF')
$darkSecondary = [System.Drawing.ColorTranslator]::FromHtml('#9FADBA')

function New-Canvas([System.Drawing.Color]$background) {
  $bmp = [System.Drawing.Bitmap]::new($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($background)
  return @{ Bitmap = $bmp; Graphics = $g }
}

function New-Font([string]$family, [float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  return [System.Drawing.Font]::new($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [System.Drawing.Color]$color, [float]$x, [float]$y, [float]$width, [float]$height, [System.Drawing.StringAlignment]$align = [System.Drawing.StringAlignment]::Near) {
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = $align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
  $brush = [System.Drawing.SolidBrush]::new($color)
  try { $g.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $width, $height), $format) }
  finally { $brush.Dispose(); $format.Dispose() }
}

function Draw-RoundedRect([System.Drawing.Graphics]$g, [System.Drawing.Brush]$brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
  } finally { $path.Dispose() }
}

function Draw-Wordmark([System.Drawing.Graphics]$g, [System.Drawing.Color]$color, [float]$y = 56) {
  $font = New-Font 'Georgia' 28 ([System.Drawing.FontStyle]::Bold)
  try { Draw-Text $g 'G E O - P U L S E' $font $color 64 $y 500 48 }
  finally { $font.Dispose() }
}

function Draw-Page([System.Drawing.Graphics]$g, [int]$page, [System.Drawing.Color]$color) {
  $font = New-Font 'Arial' 22 ([System.Drawing.FontStyle]::Bold)
  try { Draw-Text $g ("0$page / 06") $font $color 850 62 170 40 ([System.Drawing.StringAlignment]::Far) }
  finally { $font.Dispose() }
}

function Draw-ImageFill([System.Drawing.Graphics]$g, [System.Drawing.Image]$image) {
  $targetRatio = $W / $H
  $sourceRatio = $image.Width / $image.Height
  if ($sourceRatio -gt $targetRatio) {
    $srcH = $image.Height
    $srcW = [int]($srcH * $targetRatio)
    $srcX = [int](($image.Width - $srcW) / 2)
    $srcY = 0
  } else {
    $srcW = $image.Width
    $srcH = [int]($srcW / $targetRatio)
    $srcX = 0
    $srcY = [int](($image.Height - $srcH) / 2)
  }
  $g.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $W, $H), $srcX, $srcY, $srcW, $srcH, [System.Drawing.GraphicsUnit]::Pixel)
}

function Save-Canvas($canvas, [string]$name) {
  $path = Join-Path $out $name
  $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

$coverSource = [System.Drawing.Image]::FromFile((Join-Path $out 'source-cover-office.png'))
$reportSource = [System.Drawing.Image]::FromFile((Join-Path $out 'source-report-hands.png'))

try {
  # 01 - human hook
  $c = New-Canvas $dark
  Draw-ImageFill $c.Graphics $coverSource
  $overlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(115, 9, 13, 18))
  $leftOverlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(125, 9, 13, 18))
  try { $c.Graphics.FillRectangle($overlay, 0, 0, $W, $H); $c.Graphics.FillRectangle($leftOverlay, 0, 0, 760, $H) }
  finally { $overlay.Dispose(); $leftOverlay.Dispose() }
  Draw-Wordmark $c.Graphics $gold
  Draw-Page $c.Graphics 1 $darkText
  $eyebrow = New-Font 'Arial' 25 ([System.Drawing.FontStyle]::Bold)
  $hero = New-Font 'Georgia' 84 ([System.Drawing.FontStyle]::Bold)
  $support = New-Font 'Arial' 30
  try {
    Draw-Text $c.Graphics 'THE CLIENT EMAIL' $eyebrow $gold 66 250 700 42
    Draw-Text $c.Graphics '"What are you doing for GEO?"' $hero $darkText 62 310 780 430
    Draw-Text $c.Graphics 'A useful answer is not another AI trend deck.' $support $darkText 68 790 650 110
  } finally { $eyebrow.Dispose(); $hero.Dispose(); $support.Dispose() }
  Save-Canvas $c '01-client-question.png'

  # 02 - clarify what the client wants
  $c = New-Canvas $ivory
  Draw-Wordmark $c.Graphics $darkGold
  Draw-Page $c.Graphics 2 $secondary
  $label = New-Font 'Arial' 25 ([System.Drawing.FontStyle]::Bold)
  $heading = New-Font 'Georgia' 66 ([System.Drawing.FontStyle]::Bold)
  $cardNum = New-Font 'Georgia' 34 ([System.Drawing.FontStyle]::Bold)
  $cardText = New-Font 'Arial' 34 ([System.Drawing.FontStyle]::Bold)
  $small = New-Font 'Arial' 24
  try {
    Draw-Text $c.Graphics 'WHAT THEY ACTUALLY WANT' $label $darkGold 64 180 700 45
    Draw-Text $c.Graphics 'Three clear answers.' $heading $ink 62 235 880 105
    $questions = @(
      @{N='01'; T='Are we showing up?'; S='A baseline they can understand.'},
      @{N='02'; T='What changed?'; S='Movement tracked consistently over time.'},
      @{N='03'; T='What happens next?'; S='Specific work, owners and the next review.'}
    )
    $y = 420
    foreach ($q in $questions) {
      $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(20, 44, 52, 53))
      $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
      try { Draw-RoundedRect $c.Graphics $shadow 72 ($y + 8) 936 205 26; Draw-RoundedRect $c.Graphics $white 64 $y 936 205 26 }
      finally { $shadow.Dispose(); $white.Dispose() }
      Draw-Text $c.Graphics $q.N $cardNum $darkGold 96 ($y + 55) 90 58
      Draw-Text $c.Graphics $q.T $cardText $ink 205 ($y + 38) 720 55
      Draw-Text $c.Graphics $q.S $small $secondary 205 ($y + 99) 700 62
      $y += 240
    }
  } finally { $label.Dispose(); $heading.Dispose(); $cardNum.Dispose(); $cardText.Dispose(); $small.Dispose() }
  Save-Canvas $c '02-three-answers.png'

  # 03 - report structure
  $c = New-Canvas $dark
  Draw-Wordmark $c.Graphics $gold
  Draw-Page $c.Graphics 3 $darkSecondary
  $label = New-Font 'Arial' 23 ([System.Drawing.FontStyle]::Bold)
  $heading = New-Font 'Georgia' 62 ([System.Drawing.FontStyle]::Bold)
  $num = New-Font 'Georgia' 42 ([System.Drawing.FontStyle]::Bold)
  $item = New-Font 'Arial' 28 ([System.Drawing.FontStyle]::Bold)
  $small = New-Font 'Arial' 19
  try {
    Draw-Text $c.Graphics 'CLIENT-READY REPORTING' $label $gold 64 165 700 42
    Draw-Text $c.Graphics 'Show the work, not just a score.' $heading $darkText 62 220 920 165
    $items = @(
      @{N='1'; T='Prompts tracked consistently'},
      @{N='2'; T='Platforms checked'},
      @{N='3'; T='Movement since baseline'},
      @{N='4'; T='Work completed + next actions'}
    )
    $y = 460
    foreach ($i in $items) {
      $card = [System.Drawing.SolidBrush]::new($darkSurface)
      try { Draw-RoundedRect $c.Graphics $card 64 $y 952 142 24 }
      finally { $card.Dispose() }
      Draw-Text $c.Graphics $i.N $num $gold 96 ($y + 35) 60 65
      Draw-Text $c.Graphics $i.T $item $darkText 175 ($y + 38) 760 72
      $y += 165
    }
    Draw-Text $c.Graphics 'Structure shown for illustration - not client data.' $small $darkSecondary 66 1185 900 34
  } finally { $label.Dispose(); $heading.Dispose(); $num.Dispose(); $item.Dispose(); $small.Dispose() }
  Save-Canvas $c '03-report-structure.png'

  # 04 - provocative integrity slide
  $c = New-Canvas $errorColor
  Draw-Wordmark $c.Graphics ([System.Drawing.Color]::FromArgb(230, 245, 242, 232))
  Draw-Page $c.Graphics 4 ([System.Drawing.Color]::FromArgb(220, 245, 242, 232))
  $eyebrow = New-Font 'Arial' 24 ([System.Drawing.FontStyle]::Bold)
  $big = New-Font 'Georgia' 70 ([System.Drawing.FontStyle]::Bold)
  $body = New-Font 'Arial' 31
  try {
    Draw-Text $c.Graphics 'THE LINE WE WILL NOT CROSS' $eyebrow ([System.Drawing.Color]::FromArgb(230, 245, 242, 232)) 64 190 800 42
    Draw-Text $c.Graphics 'Do not make the agency look good by hiding the bad news.' $big ([System.Drawing.Color]::White) 62 260 940 400
    $rule = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 245, 242, 232))
    try { $c.Graphics.FillRectangle($rule, 64, 735, 190, 8) }
    finally { $rule.Dispose() }
    Draw-Text $c.Graphics 'Make it look good by showing that you found the issue, acted on it, and know what happens next.' $body ([System.Drawing.Color]::White) 64 805 880 250
  } finally { $eyebrow.Dispose(); $big.Dispose(); $body.Dispose() }
  Save-Canvas $c '04-no-cherry-picking.png'

  # 05 - human reporting workflow
  $c = New-Canvas $paper
  Draw-ImageFill $c.Graphics $reportSource
  $wash = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40, 248, 249, 249))
  try { $c.Graphics.FillRectangle($wash, 0, 0, $W, $H) }
  finally { $wash.Dispose() }
  $panel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(238, 245, 242, 232))
  try { Draw-RoundedRect $c.Graphics $panel 525 120 495 1010 30 }
  finally { $panel.Dispose() }
  Draw-Wordmark $c.Graphics $darkGold
  Draw-Page $c.Graphics 5 $secondary
  $label = New-Font 'Arial' 22 ([System.Drawing.FontStyle]::Bold)
  $heading = New-Font 'Georgia' 48 ([System.Drawing.FontStyle]::Bold)
  $step = New-Font 'Arial' 27 ([System.Drawing.FontStyle]::Bold)
  $arrow = New-Font 'Arial' 28 ([System.Drawing.FontStyle]::Bold)
  try {
    Draw-Text $c.Graphics 'THE CLIENT-READY STORY' $label $darkGold 575 240 390 40
    Draw-Text $c.Graphics 'A simple monthly report.' $heading $ink 570 300 390 205
    $steps = @('Baseline', 'Work completed', 'Movement', 'Next 30 days')
    $y = 520
    foreach ($s in $steps) {
      $pill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
      try { Draw-RoundedRect $c.Graphics $pill 575 $y 370 82 18 }
      finally { $pill.Dispose() }
      Draw-Text $c.Graphics $s $step $ink 600 ($y + 22) 315 38
      $y += 103
    }
  } finally { $label.Dispose(); $heading.Dispose(); $step.Dispose(); $arrow.Dispose() }
  Save-Canvas $c '05-client-ready-story.png'

  # 06 - CTA
  $c = New-Canvas $ivory
  Draw-Wordmark $c.Graphics $darkGold
  Draw-Page $c.Graphics 6 $secondary
  $label = New-Font 'Arial' 24 ([System.Drawing.FontStyle]::Bold)
  $hero = New-Font 'Georgia' 68 ([System.Drawing.FontStyle]::Bold)
  $body = New-Font 'Arial' 30
  $button = New-Font 'Arial' 28 ([System.Drawing.FontStyle]::Bold)
  $url = New-Font 'Arial' 22 ([System.Drawing.FontStyle]::Bold)
  try {
    Draw-Text $c.Graphics 'THE USEFUL VERSION' $label $darkGold 64 250 700 42
    Draw-Text $c.Graphics 'Turn "What are you doing for GEO?" into a better client conversation.' $hero $ink 62 315 930 380
    Draw-Text $c.Graphics 'Start with what AI systems can understand, what is getting in the way, and what to fix first.' $body $secondary 66 750 865 170
    $cta = [System.Drawing.SolidBrush]::new($slate)
    try { Draw-RoundedRect $c.Graphics $cta 64 995 520 92 22 }
    finally { $cta.Dispose() }
    Draw-Text $c.Graphics 'RUN A FREE SCAN  >' $button ([System.Drawing.Color]::White) 96 1023 450 42
    Draw-Text $c.Graphics 'getgeopulse.com' $url $darkGold 66 1165 450 38
  } finally { $label.Dispose(); $hero.Dispose(); $body.Dispose(); $button.Dispose(); $url.Dispose() }
  Save-Canvas $c '06-free-scan-cta.png'
} finally {
  $coverSource.Dispose()
  $reportSource.Dispose()
}

Get-ChildItem -LiteralPath $out -Filter '0*.png' | Sort-Object Name | Select-Object Name, Length
