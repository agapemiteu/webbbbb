$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'public\icons'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$source = [System.Drawing.Bitmap]::new(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($source)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$corner = 116
$diameter = $corner * 2
$path.AddArc(0, 0, $diameter, $diameter, 180, 90)
$path.AddArc(512 - $diameter, 0, $diameter, $diameter, 270, 90)
$path.AddArc(512 - $diameter, 512 - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc(0, 512 - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$blue = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40, 108, 240))
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 242, 100))
$graphics.FillPath($blue, $path)

$font = [System.Drawing.Font]::new('Arial', 318, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$bounds = [System.Drawing.RectangleF]::new(10, -8, 492, 512)
$graphics.DrawString('w', $font, $white, $bounds, $format)
$graphics.FillEllipse($lime, 374, 44, 72, 72)

foreach ($size in @(16, 32, 48, 128)) {
  $icon = [System.Drawing.Bitmap]::new($size, $size)
  $iconGraphics = [System.Drawing.Graphics]::FromImage($icon)
  $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $iconGraphics.DrawImage($source, 0, 0, $size, $size)
  $icon.Save((Join-Path $outputDirectory "webb-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $iconGraphics.Dispose()
  $icon.Dispose()
}

$format.Dispose()
$font.Dispose()
$blue.Dispose()
$white.Dispose()
$lime.Dispose()
$path.Dispose()
$graphics.Dispose()
$source.Dispose()
Write-Output "Webb icons generated in $outputDirectory"
