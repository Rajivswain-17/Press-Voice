$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$wpf = Join-Path $framework 'WPF'
$output = Join-Path ([IO.Path]::GetTempPath()) ("press-policy-" + [Guid]::NewGuid() + ".exe")
try {
    # Compile the same default policy as the production companion, without fixture authorization.
    $policyTest = @"
using System;
class ProductionPolicyTest {
    static void Main() {
        string reply = null;
        if (!TargetInsertion.Command(new[]{"INSERT","1","VEVTVA=="}, line => reply=line) ||
            reply != "EDIT 1 REFUSED" || typeof(TargetInsertion).GetMethod("ReplaceSelection",
                System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic) != null)
            throw new Exception("Production external edit policy failed.");
    }
}
"@
    $source = [IO.Path]::ChangeExtension($output, '.cs')
    [IO.File]::WriteAllText($source, $policyTest)
    & "$framework\csc.exe" /nologo /platform:x64 "/out:$output" "$root\native\windows\TargetInsertion.cs" $source
    if ($LASTEXITCODE) { throw 'Production policy test compilation failed.' }
    & $output
    if ($LASTEXITCODE) { throw 'Production policy test failed.' }
    & "$framework\csc.exe" /define:PRESS_TIER_A_FIXTURE /nologo /platform:x64 "/out:$output" /reference:"$wpf\UIAutomationClient.dll" /reference:"$wpf\UIAutomationTypes.dll" /reference:"$wpf\WindowsBase.dll" "$root\native\windows\TargetInsertion.cs" "$PSScriptRoot\TargetPolicyTests.cs"
    if ($LASTEXITCODE) { throw 'Native policy test compilation failed.' }
    & $output
    if ($LASTEXITCODE) { throw 'Native policy assertions failed.' }
    & "$framework\csc.exe" /define:PRESS_TIER_A_FIXTURE /nologo /platform:x64 "/out:$output" /reference:System.Windows.Forms.dll /reference:"$wpf\UIAutomationClient.dll" /reference:"$wpf\UIAutomationTypes.dll" /reference:"$wpf\WindowsBase.dll" "$root\native\windows\TargetInsertion.cs" "$PSScriptRoot\FixtureInsertion.cs"
    if ($LASTEXITCODE) { throw 'Fixture compilation failed.' }
    node "$root\scripts\verify-insertion.mjs" $output
    if ($LASTEXITCODE) { throw 'Fixture integration failed.' }
} finally {
    if ($source -and (Test-Path -LiteralPath $source)) { Remove-Item -LiteralPath $source }
    if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output }
}
