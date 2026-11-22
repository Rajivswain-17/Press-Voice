# Run in an unlocked Windows desktop using Windows PowerShell 5.1.
# This diagnostic opens its own test window. It sends keys only while that
# window is foreground. Close other test copies before running.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Press2A {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("winmm.dll")] public static extern uint waveInGetNumDevs();
    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct WaveFormat {
        public ushort Format, Channels;
        public uint Rate, BytesPerSecond;
        public ushort Alignment, Bits, Extra;
    }
    [DllImport("winmm.dll")]
    public static extern uint waveInOpen(IntPtr result, uint device, ref WaveFormat format, UIntPtr callback, UIntPtr instance, uint flags);
}
'@

$root = Split-Path $PSScriptRoot
$exe = Join-Path $root 'runtime\windows-key-listener.exe'
if ((Get-FileHash -LiteralPath $exe).Hash -ne '3a3e25093e7d79611c784b06766ac8dc100e6e0ca9b59f81030cb01061a7e8b5') {
    throw 'The standalone listener failed its pinned hash check.'
}
$form = [Windows.Forms.Form]::new()
$form.Text = 'Press Task 2A keyboard probe'
$form.TopMost = $true
$field = [Windows.Forms.TextBox]::new()
$field.Dock = 'Top'
$form.Controls.Add($field)
$observed = [Collections.Generic.List[string]]::new()
$field.add_KeyDown({ param($sender, $event) $observed.Add($event.KeyCode.ToString()) })
$form.Show()
$form.Activate()
[void]$field.Focus()
[Windows.Forms.Application]::DoEvents()

function Send-TestKeys($events) {
    foreach ($event in $events) {
        if ([Press2A]::GetForegroundWindow() -ne $form.Handle) {
            throw 'The Press test window lost focus. Key injection was stopped.'
        }
        $key = [byte][Math]::Abs($event)
        $flags = if ($event -lt 0) { 2 } else { 0 }
        if ($key -eq 163) { $flags = $flags -bor 1 } # Extended Right Ctrl.
        [Press2A]::keybd_event($key, 0, $flags, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 45
        [Windows.Forms.Application]::DoEvents()
    }
}

function Test-Binding($binding, $events) {
    $process = [Diagnostics.Process]::new()
    $process.StartInfo.FileName = $exe
    $process.StartInfo.Arguments = $binding
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $observed.Clear()
    try {
        [void]$process.Start()
        $started = $process.StandardOutput.ReadLineAsync()
        if (!$started.Wait(4000)) { throw 'The native startup probe timed out.' }
        $ready = $started.Result -eq 'READY'
        if ($ready) {
            Send-TestKeys $events
            $process.Refresh()
            $wsKiB = [Math]::Round($process.WorkingSet64 / 1KB)
        }
        if (!$process.HasExited) { $process.Kill() }
        if (!$process.WaitForExit(5000)) { throw 'The owned helper did not exit.' }
        $edges = @($process.StandardOutput.ReadToEnd().Split("`r`n", [StringSplitOptions]::RemoveEmptyEntries))
        [ordered]@{
            binding = $binding
            listenerDiagnostic = $process.StandardError.ReadToEnd().Trim()
            ready = $ready
            edges = $edges
            foregroundKeys = @($observed)
            workingSetKiB = $(if ($ready) { $wsKiB })
            exited = $process.HasExited
        }
    } finally {
        if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}

try {
    $capsBefore = [Windows.Forms.Control]::IsKeyLocked([Windows.Forms.Keys]::CapsLock)
    try {
        $caps = Test-Binding 'Ctrl+CapsLock' @(162, 20, -20, -162)
        $capsChanged = $capsBefore -ne [Windows.Forms.Control]::IsKeyLocked([Windows.Forms.Keys]::CapsLock)
    } finally {
        if ($capsBefore -ne [Windows.Forms.Control]::IsKeyLocked([Windows.Forms.Keys]::CapsLock)) {
            Send-TestKeys @(20, -20)
        }
    }
    $bindTests = @(
        (Test-Binding 'F8' @(119, 119, 119, -119, 119, -119)),
        (Test-Binding 'RightCtrl' @(162, -162, 163, -163)),
        (Test-Binding '163' @(162, -162, 163, 163, -163)),
        (Test-Binding 'Ctrl+Shift+F8' @(162, 160, 119, -160, -119, -162)),
        (Test-Binding 'Ctrl+Shift+Windows' @())
        $caps
    )
    $registered = [Press2A]::RegisterHotKey($form.Handle, 101, 0x4006, 121)
    $duplicate = $false
    if ($registered) {
        try {
            $duplicate = [Press2A]::RegisterHotKey($form.Handle, 102, 0x4006, 121)
            if ($duplicate) { [void][Press2A]::UnregisterHotKey($form.Handle, 102) }
        } finally { [void][Press2A]::UnregisterHotKey($form.Handle, 101) }
    }
    $format = [Press2A+WaveFormat]::new()
    $format.Format = 1
    $format.Channels = 1
    $format.Rate = 16000
    $format.BytesPerSecond = 32000
    $format.Alignment = 2
    $format.Bits = 16
    # WAVE_FORMAT_QUERY avoids creating an audio stream or recording speech.
    $audioQuery = [Press2A]::waveInOpen([IntPtr]::Zero, [uint32]::MaxValue, [ref]$format, [UIntPtr]::Zero, [UIntPtr]::Zero, 1)
    if (($bindTests[0].edges -join ',') -ne 'KEY_DOWN,KEY_UP,KEY_DOWN,KEY_UP' -or
        $bindTests[0].foregroundKeys.Count -ne 4) { throw 'Unexpected F8 repeat or forwarding behavior.' }
    foreach ($index in 1, 2, 3) {
        if (($bindTests[$index].edges -join ',') -ne 'KEY_DOWN,KEY_UP') { throw 'Expected one native press and release.' }
    }
    if (!$registered -or $duplicate) { throw 'The controlled conflict test did not behave as expected.' }
    [ordered]@{
        bindings = $bindTests
        hotkeyRegistration = $registered
        duplicateRegistration = $duplicate
        capsLockChangedAndRestored = $capsChanged
        audioDeviceCount = [Press2A]::waveInGetNumDevs()
        defaultPcm16QueryResult = $audioQuery
    } | ConvertTo-Json -Depth 5
} finally { $form.Dispose() }
