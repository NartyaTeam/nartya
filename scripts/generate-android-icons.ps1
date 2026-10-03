param(
    [string]$Source = "public/icon.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot $Source
$resPath = Join-Path $projectRoot "android/app/src/main/res"
$ink = [System.Drawing.Color]::FromArgb(255, 11, 11, 13)

$densitySizes = [ordered]@{
    "mdpi" = 48
    "hdpi" = 72
    "xhdpi" = 96
    "xxhdpi" = 144
    "xxxhdpi" = 192
}

function New-Canvas([int]$size) {
    return [System.Drawing.Bitmap]::new(
        $size,
        $size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
}

function Set-Quality([System.Drawing.Graphics]$graphics) {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
}

function Draw-Logo(
    [System.Drawing.Graphics]$graphics,
    [System.Drawing.Image]$logo,
    [int]$canvasSize,
    [double]$scale
) {
    $logoSize = [int][Math]::Round($canvasSize * $scale)
    $offset = [int][Math]::Round(($canvasSize - $logoSize) / 2)
    $destination = [System.Drawing.Rectangle]::new($offset, $offset, $logoSize, $logoSize)
    $graphics.DrawImage($logo, $destination)
}

function Save-LegacyIcon(
    [System.Drawing.Image]$logo,
    [int]$size,
    [string]$path,
    [bool]$round
) {
    $bitmap = New-Canvas $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Set-Quality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)

    if ($round) {
        $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $shape.AddEllipse(0, 0, $size - 1, $size - 1)
    } else {
        $radius = [Math]::Max(2, [int][Math]::Round($size * 0.18))
        $diameter = $radius * 2
        $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $shape.AddArc(0, 0, $diameter, $diameter, 180, 90)
        $shape.AddArc($size - $diameter - 1, 0, $diameter, $diameter, 270, 90)
        $shape.AddArc($size - $diameter - 1, $size - $diameter - 1, $diameter, $diameter, 0, 90)
        $shape.AddArc(0, $size - $diameter - 1, $diameter, $diameter, 90, 90)
        $shape.CloseFigure()
    }

    $brush = [System.Drawing.SolidBrush]::new($ink)
    $graphics.FillPath($brush, $shape)
    $graphics.SetClip($shape)
    Draw-Logo $graphics $logo $size 0.94

    $directory = Split-Path -Parent $path
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

    $brush.Dispose()
    $shape.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

function Save-AdaptiveForeground(
    [System.Drawing.Image]$logo,
    [int]$size,
    [string]$path
) {
    $bitmap = New-Canvas $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Set-Quality $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)

    # Android réserve 66 dp sur les 108 dp de la couche pour la zone toujours visible.
    # Le fichier source contient déjà une marge transparente : 74 % conserve le visage
    # et le kanji sous tous les masques tout en gardant une présence nette dans le launcher.
    Draw-Logo $graphics $logo $size 0.74

    $directory = Split-Path -Parent $path
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bitmap.Dispose()
}

$logo = [System.Drawing.Image]::FromFile($sourcePath)
try {
    foreach ($density in $densitySizes.Keys) {
        $legacySize = $densitySizes[$density]
        $adaptiveSize = [int][Math]::Round($legacySize * 2.25)
        $directory = Join-Path $resPath "mipmap-$density"

        Save-LegacyIcon $logo $legacySize (Join-Path $directory "ic_launcher.png") $false
        Save-LegacyIcon $logo $legacySize (Join-Path $directory "ic_launcher_round.png") $true
        Save-AdaptiveForeground $logo $adaptiveSize (Join-Path $directory "ic_launcher_foreground.png")
    }
} finally {
    $logo.Dispose()
}

Write-Host "Icônes Android Nartya générées depuis $Source."
