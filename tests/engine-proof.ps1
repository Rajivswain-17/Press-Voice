[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 18761,
    [string]$OutputPath,
    [int]$StopConsoleForProcess = 0
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop') { throw 'Run this proof with Windows PowerShell 5.1 (powershell.exe).' }

if ($StopConsoleForProcess) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PressProofConsole {
    [DllImport("kernel32.dll")] public static extern bool FreeConsole();
    [DllImport("kernel32.dll")] public static extern bool AttachConsole(uint processId);
    [DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList(uint[] ids, uint count);
    [DllImport("kernel32.dll")] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll")] public static extern bool GenerateConsoleCtrlEvent(uint evt, uint group);
}
'@
    [void][PressProofConsole]::FreeConsole()
    if (![PressProofConsole]::AttachConsole([uint32]$StopConsoleForProcess)) { exit 2 }
    try {
        $ids = New-Object 'uint32[]' 3
        if ([PressProofConsole]::GetConsoleProcessList($ids, $ids.Length) -ne 2 -or
            $StopConsoleForProcess -notin $ids -or $PID -notin $ids) { exit 3 }
        if (![PressProofConsole]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)) { exit 4 }
        if (![PressProofConsole]::GenerateConsoleCtrlEvent(0, 0)) { exit 5 }
        Start-Sleep -Milliseconds 250
    } finally {
        [void][PressProofConsole]::FreeConsole()
    }
    exit 0
}

Add-Type -AssemblyName System.Net.Http
$root = Split-Path $PSScriptRoot
$exe = Join-Path $root 'runtime\whisper-server-win32-x64-cpu.exe'
$model = Join-Path $root 'models\ggml-tiny.en-q5_1.bin'
$wav = Join-Path $PSScriptRoot 'fixtures\jfk.wav'
$runtimeDllNames = @('msvcp140.dll', 'vcomp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
$expectedHashes = @{
    'whisper-server-win32-x64-cpu.exe' = '9df52d68a3656d66ed34e0bbb602a06fd38ba1e0839d0a1e0fb2bbe5b4bddf24'
    'ggml-tiny.en-q5_1.bin'            = 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b'
    'jfk.wav'                        = '59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e'
    'msvcp140.dll'                   = '0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9'
    'vcomp140.dll'                   = '55aba23cdcd6484fbb06f4155b8ca75adfce7a881f10afd0c49457165e677164'
    'vcruntime140.dll'               = 'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066'
    'vcruntime140_1.dll'             = '1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f'
}
$files = @(Get-Item -LiteralPath $exe, $model, $wav)
$files += @($runtimeDllNames | ForEach-Object { Get-Item -LiteralPath (Join-Path (Split-Path $exe) $_) })
$assets = @($files | ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    if ($hash -ne $expectedHashes[$_.Name]) { throw "Pinned SHA-256 mismatch for $($_.Name)." }
    [ordered]@{ file = $_.Name; bytes = $_.Length; sha256 = $hash }
})
$reference = 'And so, my fellow Americans, ask not what your country can do for you. Ask what you can do for your country.'
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.BaseAddress = [uri]"http://127.0.0.1:$Port/"
$client.Timeout = [TimeSpan]::FromSeconds(30)

function Get-Wer([string]$Hypothesis) {
    $expected = [regex]::Matches($reference.ToLowerInvariant(), '[a-z0-9]+').Value
    $actual = [regex]::Matches($Hypothesis.ToLowerInvariant(), '[a-z0-9]+').Value
    $row = [int[]](0..$expected.Count)
    for ($i = 0; $i -lt $actual.Count; $i++) {
        $diagonal = $row[0]
        $row[0] = $i + 1
        for ($j = 1; $j -le $expected.Count; $j++) {
            $above = $row[$j]
            $cost = [int]($actual[$i] -ne $expected[$j - 1])
            $row[$j] = [Math]::Min([Math]::Min($above + 1, $row[$j - 1] + 1), $diagonal + $cost)
            $diagonal = $above
        }
    }
    [ordered]@{
        referenceWords = $expected.Count
        wordEdits = $row[$expected.Count]
        werPercent = [Math]::Round(100 * $row[$expected.Count] / $expected.Count, 2)
    }
}

function Read-Tcp([int]$ServerId) {
    @(netstat.exe -ano | ForEach-Object {
        $columns = $_.Trim() -split '\s+'
        if ($columns.Length -eq 5 -and $columns[0] -eq 'TCP' -and $columns[4] -eq "$ServerId") {
            '{0} {1} {2}' -f $columns[1], $columns[2], $columns[3]
        }
    })
}

function Assert-PortFree {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $probe.Start() } finally { $probe.Stop() }
}

function Measure-DefaultRoutes {
    $routes = @(Get-NetRoute | Where-Object {
        $_.DestinationPrefix -in @('0.0.0.0/0', '::/0') -and $_.InterfaceAlias -notmatch 'loopback'
    })
    [ordered]@{
        ipv4 = @($routes | Where-Object DestinationPrefix -eq '0.0.0.0/0').Count
        ipv6 = @($routes | Where-Object DestinationPrefix -eq '::/0').Count
    }
}

function Invoke-Inference($Process, $TcpSamples) {
    $body = [System.Net.Http.MultipartFormDataContent]::new()
    try {
        $audio = [System.Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes($wav))
        $audio.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('audio/wav')
        $body.Add($audio, 'file', 'jfk.wav')
        $body.Add([System.Net.Http.StringContent]::new('json'), 'response_format')
        $body.Add([System.Net.Http.StringContent]::new('en'), 'language')
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $request = $client.PostAsync('inference', $body)
        foreach ($row in (Read-Tcp $Process.Id)) { [void]$TcpSamples.Add($row) }
        $completedDuringSnapshot = $request.IsCompleted
        $response = $request.GetAwaiter().GetResult()
        $timer.Stop()
        try {
            [void]$response.EnsureSuccessStatusCode()
            $text = ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json).text.Trim()
        } finally {
            $response.Dispose()
        }
        $Process.Refresh()
        [ordered]@{
            pid = $Process.Id
            latencyMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 1)
            completedByTcpSnapshotEnd = $completedDuringSnapshot
            transcript = $text
            accuracy = Get-Wer $text
        }
    } finally {
        $body.Dispose()
    }
}

function Invoke-ServerRun([string]$Name, [int]$RequestCount) {
    Assert-PortFree
    $stdout = Join-Path $scratch "$Name.out"
    $stderr = Join-Path $scratch "$Name.err"
    $arguments = "--host 127.0.0.1 --port $Port --model `"$model`" --no-gpu --threads 4 --language en --public `"$public`""
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    try {
        [void]$process.Handle
        $health = $null
        while ($timer.Elapsed.TotalSeconds -lt 20 -and !$process.HasExited) {
            try {
                $probe = $client.GetAsync('health').GetAwaiter().GetResult()
                try {
                    if ($probe.IsSuccessStatusCode) {
                        $health = ($probe.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json).status
                    }
                } finally { $probe.Dispose() }
            } catch [System.Net.Http.HttpRequestException] {}
            if ($health -eq 'ok') { break }
            Start-Sleep -Milliseconds 25
        }
        $ready = [Math]::Round($timer.Elapsed.TotalMilliseconds, 1)
        if ($health -ne 'ok') { throw "Server did not become ready. $(Get-Content -LiteralPath $stderr -Raw)" }
        $process.Refresh()
        $readyWorkingSet = $process.WorkingSet64
        $samples = [Collections.Generic.HashSet[string]]::new()
        foreach ($row in (Read-Tcp $process.Id)) { [void]$samples.Add($row) }
        $listeners = @($samples | Where-Object { $_ -match 'LISTENING$' })
        if ($listeners.Count -ne 1 -or $listeners[0] -ne "127.0.0.1:$Port 0.0.0.0:0 LISTENING") {
            throw "PID $($process.Id) does not own the expected loopback listener."
        }
        $loadedRuntimeDlls = @($process.Modules | Where-Object {
            $_.ModuleName -in $runtimeDllNames -and (Split-Path $_.FileName) -eq (Split-Path $exe)
        } | Select-Object -ExpandProperty ModuleName | Sort-Object)
        if (Compare-Object $runtimeDllNames $loadedRuntimeDlls) { throw 'The child did not load every staged runtime DLL.' }
        $requests = @(for ($i = 0; $i -lt $RequestCount; $i++) { Invoke-Inference $process $samples })
        $idleTimer = [Diagnostics.Stopwatch]::StartNew()
        Start-Sleep -Seconds 2
        $process.Refresh()
        $idle = $process.WorkingSet64
        $peak = $process.PeakWorkingSet64
        $idleElapsed = [Math]::Round($idleTimer.Elapsed.TotalMilliseconds, 1)
        foreach ($row in (Read-Tcp $process.Id)) { [void]$samples.Add($row) }
        if (@($samples | Where-Object { $_ -match "^127\.0\.0\.1:$Port\s+\S+\s+LISTENING$" }).Count -ne 1 -or
            @($samples | Where-Object { $_ -match 'LISTENING$' -and $_ -notmatch "^127\.0\.0\.1:$Port " }).Count) {
            throw "Expected only a listener on 127.0.0.1:$Port for PID $($process.Id). Saw $($samples -join '; ')"
        }
        if (@($samples | Where-Object { $_ -notmatch 'LISTENING$' -and $_ -notmatch '^127\.0\.0\.1:\d+ 127\.0\.0\.1:\d+ ' }).Count) {
            throw "Found an unexpected non-loopback TCP row for PID $($process.Id)."
        }
        if ($requests | Where-Object { $_.accuracy.werPercent -gt 10 }) { throw 'Fixture exceeded the 10% WER smoke-test limit.' }
        if ($requests.Count -ne $RequestCount -or @($requests | Where-Object pid -ne $process.Id).Count) {
            throw 'Inference requests did not complete with the same owned child.'
        }
        $stop = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -StopConsoleForProcess $($process.Id)" -WindowStyle Hidden -PassThru
        [void]$stop.Handle
        if (!$stop.WaitForExit(10000)) {
            $stop.Kill()
            throw 'The Ctrl+C helper did not exit.'
        }
        if ($stop.ExitCode -ne 0 -or !$process.WaitForExit(10000)) {
            throw "Private-console Ctrl+C failed with helper exit $($stop.ExitCode)."
        }
        if ($process.ExitCode -ne 0 -or (Get-Content -LiteralPath $stdout -Raw) -notmatch 'shutting down gracefully') {
            throw "Native graceful shutdown was not confirmed. Server exit code: $($process.ExitCode). $(Get-Content -LiteralPath $stdout -Raw)"
        }
        $loadMatch = [regex]::Match((Get-Content -LiteralPath $stderr -Raw), 'load time\s*=\s*([\d.]+) ms')
        if (!$loadMatch.Success) { throw 'Native model-load timing was missing.' }
        $remainingListener = @(Read-Tcp $process.Id | Where-Object { $_ -match 'LISTENING$' })
        if ($remainingListener.Count) { throw 'The stopped process retained a listener.' }
        [ordered]@{
            pid = $process.Id
            health = $health
            launchToHealthMs = $ready
            nativeModelLoadMs = [double]::Parse($loadMatch.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
            readyWorkingSetBytes = $readyWorkingSet
            idleWorkingSetBytes = $idle
            idleObservationMs = $idleElapsed
            peakWorkingSetThroughIdleBytes = $peak
            loadedRuntimeDlls = $loadedRuntimeDlls
            inference = $requests
            tcpSnapshots = @($samples | Sort-Object)
            gracefulCtrlC = $true
            exitCode = $process.ExitCode
            listenerReleased = $true
        }
    } finally {
        if (!$process.HasExited) {
            $process.Kill()
            [void]$process.WaitForExit(5000)
        }
        $process.Dispose()
    }
}

$scratch = Join-Path ([IO.Path]::GetTempPath()) ('press-engine-proof-' + [guid]::NewGuid().ToString('N'))
$public = Join-Path $scratch 'public'
[void](New-Item -ItemType Directory -Path $scratch)
try {
    [void](New-Item -ItemType Directory -Path $public)
    $routesBefore = Measure-DefaultRoutes
    $first = Invoke-ServerRun 'initial' 4
    $restart = Invoke-ServerRun 'restart' 1
    $routesAfter = Measure-DefaultRoutes
    if ($first.pid -eq $restart.pid) { throw 'Expected a different child process ID on restart.' }
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $result = [ordered]@{
        recordedAtUtc = [DateTime]::UtcNow.ToString('o')
        windowsBuild = [Environment]::OSVersion.Version.ToString()
        cpu = $cpu.Name.Trim()
        processorThreads = 4
        port = $Port
        nonLoopbackDefaultRoutesBefore = $routesBefore
        nonLoopbackDefaultRoutesAfter = $routesAfter
        reference = $reference
        installedEngineAndModelBytes = ($files | Where-Object Name -ne 'jfk.wav' | Measure-Object -Property Length -Sum).Sum
        assets = $assets
        initial = $first
        restart = $restart
    }
    $json = $result | ConvertTo-Json -Depth 12
    if ($OutputPath) {
        $resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
        [IO.File]::WriteAllText($resolvedOutput, $json + [Environment]::NewLine)
    }
    $json
} finally {
    $client.Dispose()
    Get-ChildItem -LiteralPath $scratch -File | Remove-Item
    Remove-Item -LiteralPath $public, $scratch
}

