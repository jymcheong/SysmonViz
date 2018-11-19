var stringSimilarity = require('string-similarity');
var jw = require('jaro-winkler');

var a = "C:\\$WINDOWS.~BT\\Work\\99E5C8D9-BB39-40B0-B88D-BC6DF663B4B6\\dismhost.exe {63E5C7FB-02E9-4B36-A64F-8E3673890F43}"
var b = "C:\\$WINDOWS.~BT\\Work\\9A45D8DC-0781-4008-9A5B-C4615C8989EA\\dismhost.exe {71557795-DF9D-4DD8-8CCA-5DB2FA2C47B1}"


console.log('ss: ' + stringSimilarity.compareTwoStrings(a, b))
console.log('jw: ' + jw(a,b))
