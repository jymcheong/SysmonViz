[Reflection.Assembly]::LoadWithPartialName('Microsoft.JScript');
$path = "LOGPATH"
$username = 'root'
$password = 'Password1234'
$odbURI = "http://ODBHOST:2480"
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $username,$password)))
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$jsEngine = [Microsoft.JScript.Vsa.VsaEngine]::CreateEngine()
$queue = [System.Collections.Queue] @()

# Connect to ODB
try {
    $response = Invoke-Webrequest -Headers @{Authorization=("Basic {0}" -f $base64AuthInfo)} -UseBasicParsing  "$odbURI/connect/DataFusion" -WebSession $session
}
catch{
    $_.Exception.Message
    exit
}

function processFile($filename) {
    try {
        foreach($line in Get-Content "$path$filename" ) {
            $js = "escape('" + [System.Text.RegularExpressions.Regex]::Escape($line) + "');"
            $escaped = [Microsoft.JScript.Eval]::JScriptEvaluate($js,$jsEngine);
            $body = '{"jsondata":"'+ $escaped + '"}'
            try {
              $response = Invoke-Webrequest -WebSession $session  -UseBasicParsing  "$odbURI/function/DataFusion/AddEvent" -Method Post -Body $body -ContentType "application/json"
            }
            catch {
               $_.Exception.ItemName
               $_.Exception.Message
               continue
            }
        }      
    }
    catch{
       $_.Exception.ItemName
       $_.Exception.Message
    }
    finally{
        Remove-Item -Path "$path$filename"
    }
}

while($true){
    $txtfiles = Get-ChildItem "$path*rotated*.txt" -include *.txt -name | Sort
    foreach($f in $txtfiles) {  
        if($queue.Contains($f)){ continue }
        $queue.enqueue($f)
    }
    while($queue.Count -gt 0) {
        "dequeuing " + $queue.Peek()
        processFile($queue.Dequeue())
    } 
    Start-Sleep -m 1000
}
