param($startpath=c:\)

write-host "Getting file list from" $startpath
$files = get-childitem $startpath -recurse | where {$_.extension.tolower() -eq ".exe" -or $_.extension.tolower() -eq ".sys" -or $_.extension.tolower() -eq ".dll"}
$hashesMD5 = $files | Get-FileHash -Algorithm MD5
$hashesSHA256 = $files | Get-FileHash -Algorithm SHA256

$hashTableEXE = @{}
$hashTableSYSDLL = @{}

# this assume the Sysmon driver is configured to use MD5 & SHA256
$hashesMD5 | ForEach-Object { 
    if($_.Path.endswith(".exe")) {
        $hashTableEXE.Add($_.Path, "MD5=" + $_.Hash)
    }
    else {
        $hashTableSYSDLL.Add($_.Path, "MD5=" + $_.Hash)
    }
}

$hashesSHA256 | ForEach-Object { 
    if($_.Path.endswith(".exe")) {
        $hashTableEXE[$_.Path] = $hashTableEXE[$_.Path] + ",SHA256=" + $_.Hash 
    }
    else {
        $hashTableSYSDLL[$_.Path] = $hashTableSYSDLL[$_.Path] + ",SHA256=" + $_.Hash 
    }
}

# use the hash table below to churn out database statements for ingestion
$hashTableEXE
$hashTableSYSDLL