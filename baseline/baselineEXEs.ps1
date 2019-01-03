param($startpath=c:\)

write-host "Getting file list from" $startpath
$files = get-childitem $startpath -recurse | where {$_.extension.tolower() -eq ".exe"}
$hashesMD5 = $files | Get-FileHash -Algorithm MD5
$hashesSHA256 = $files | Get-FileHash -Algorithm SHA256

$hashTable = @{}
$hashesMD5 | ForEach-Object { $hashTable.Add($_.Path, "MD5=" + $_.Hash) }
$hashesSHA256 | ForEach-Object { $hashTable[$_.Path] = $hashTable[$_.Path] + ",SHA256=" + $_.Hash }
$hashTable