# Validation helper only: decode existing brand PNGs with Windows System.Drawing.
# This is explicitly not the production Sharp pipeline and does not validate it.
Add-Type -AssemblyName System.Drawing
$validationRoot = (Resolve-Path -LiteralPath '.').Path
$validationOutput = Join-Path $validationRoot 'docs/evidence'
$validationFiles = @('ID VISUAL 01.png', 'ID VISUAL 02.png', 'LOGO CLICK IT.png')
$validationRecords = @()
for ($validationIndex = 0; $validationIndex -lt $validationFiles.Length; $validationIndex++) {
    $validationFile = $validationFiles[$validationIndex]
    $validationWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $validationSource = [System.Drawing.Bitmap]::FromFile((Join-Path $validationRoot $validationFile))
    $validationScale = [Math]::Min(256.0 / $validationSource.Width, 256.0 / $validationSource.Height)
    $validationWidth = [Math]::Max(1, [int]($validationSource.Width * $validationScale))
    $validationHeight = [Math]::Max(1, [int]($validationSource.Height * $validationScale))
    $validationBitmap = New-Object System.Drawing.Bitmap($validationSource, $validationWidth, $validationHeight)
    $validationPixels = New-Object byte[] ($validationWidth * $validationHeight)
    try {
        for ($validationY = 0; $validationY -lt $validationHeight; $validationY++) {
            for ($validationX = 0; $validationX -lt $validationWidth; $validationX++) {
                $validationColor = $validationBitmap.GetPixel($validationX, $validationY)
                $validationPixels[$validationY * $validationWidth + $validationX] = [byte][Math]::Round($validationColor.R * 0.299 + $validationColor.G * 0.587 + $validationColor.B * 0.114)
            }
        }
        $validationGrayFile = 'asset-' + $validationIndex + '.gray'
        [System.IO.File]::WriteAllBytes((Join-Path $validationOutput $validationGrayFile), $validationPixels)
        $validationWatch.Stop()
        $validationRecords += @{ input=$validationFile; inputKind='BRAND_PNG_NOT_PHOTOGRAPH'; originalWidth=$validationSource.Width; originalHeight=$validationSource.Height; width=$validationWidth; height=$validationHeight; grayscaleFile=$validationGrayFile; decodeMs=$validationWatch.Elapsed.TotalMilliseconds; decoder='Windows System.Drawing; NOT Sharp' }
    } finally {
        $validationBitmap.Dispose()
        $validationSource.Dispose()
    }
}
$validationRecords | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $validationOutput 'decoded-assets.json')
