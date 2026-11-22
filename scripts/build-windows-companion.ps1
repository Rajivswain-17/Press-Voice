$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows x64 .NET Framework compiler is unavailable.' }
$output = Join-Path $root 'runtime\press-windows-companion.exe'
[void](New-Item -ItemType Directory -Path (Split-Path $output) -Force)
$wpf = Join-Path (Split-Path $compiler) 'WPF'
& $compiler /reference:"$wpf\UIAutomationClient.dll" /reference:"$wpf\UIAutomationTypes.dll" /reference:"$wpf\WindowsBase.dll" /nologo /optimize+ /platform:x64 /target:exe /reference:System.Windows.Forms.dll "/out:$output" (Join-Path $root 'native\windows\ShortcutListener.cs') (Join-Path $root 'native\windows\MicrophoneCapture.cs') (Join-Path $root 'native\windows\TargetInsertion.cs')
if ($LASTEXITCODE) { throw 'Press companion compilation failed.' }
"Built $output ($((Get-Item -LiteralPath $output).Length) bytes)"
