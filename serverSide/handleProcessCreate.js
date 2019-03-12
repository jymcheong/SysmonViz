const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from processcreate")

var _mapProcessCreate = new Map()
var _processCreateQ = []
var _retries = {}

function eventHandler(newpc) { // a fix function name that is used within startLiveQuery
    var rid = '' + newpc['@rid']
    _mapProcessCreate.set(newpc['Hostname'] + newpc['ProcessGuid'], rid) //cache it both in memory & file
    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { 
        if(err) { console.log(err); return; } 
    });
    if(newpc['ParentImage'] != 'System') {
        _processCreateQ.push(newpc)               
    }
}

setInterval(function(){ processQueue()},200); 


function fixParent(newpc) {
    _session.query("select from pc Where ParentImage like '%smss.exe' AND Image like '%smss.exe' AND ProcessId = :id order by id desc limit 1", 
    { params : {id: newpc['ParentProcessId']}}) // find the real parent
    .all()
    .then((data)=> {
        if(data.length > 0){ // correct the child process parent-related-fields
            _session.command("UPDATE " + newpc['@rid'] + " SET ParentProcessGuid = :p1, ParentProcessId = :p2, ParentImage = :p3, ParentCommandLine = :p4"
            ,{ params : {p1: data[0]['ProcessGuid'], p2: data[0]['ProcessId'], p3: data[0]['Image'], p4: data[0]['CommandLine'] }} )
            .on('data',(results)=> {
                console.log('Updated parent process fields for affected entry...' + newpc['@rid'])
                parentRID = data[0]['@rid']
                connectParentOf(parentRID, newpc['@rid']) // link to the correct parent
                _processCreateQ.shift()
            })
        }
        else {
            console.log('Cannot find smss.exe, retrying later...')
        }
    })
}

function processQueue(){
    if(_processCreateQ.length == 0) return; 
    var newpc = _processCreateQ[0];
    if(newpc['ParentImage'].indexOf('svchost.exe') > 0 && (newpc['Image'].indexOf('wininit.exe') > 0 || newpc['Image'].indexOf('csrss.exe') > 0)) {
        console.log('Sysmon bug found... ' + newpc['@rid']) // the following fixes a Sysmon BUG
        fixParent(newpc)
    }
    else {
        var parentRID = _mapProcessCreate.get(newpc['Hostname'] + newpc['ParentProcessGuid'])
        if(parentRID) {
            connectParentOf(parentRID, newpc['@rid'])
            _processCreateQ.shift()
        }
        else {
            console.log('Searching database for parent of ' + newpc['Image'])
            _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
            { params : {guid: newpc['ParentProcessGuid'], hostname: newpc['Hostname']}})
            .all()
            .then((data)=> {
                if(data.length > 0) {
                    console.log('Found parent RID from DB for ' + newpc['Image'])
                    _mapProcessCreate.set(newpc['Hostname'] + newpc['ParentProcessGuid'], data[0]['@rid'])
                    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], data[0]['@rid'], function(err) { if(err) console.log(err) });
                }
                else { // retry...
                    var key = newpc['ParentProcessGuid'] + newpc['Hostname']
                    if(key in _retries) {
                        if(_retries[key] == 10) { // max wait for 1 sec (10 x 100ms interval)
                            console.log('Cannot find ' + newpc['ParentProcessGuid'] + ' for '+ newpc['Image'] + ' on ' + newpc['Hostname'])
                            _processCreateQ.shift()
                            fs.writeFile(_cacheProcessCreateRID + '/MISSING-' + newpc['Hostname'] + newpc['ParentProcessGuid'], '', function(err) { if(err) console.log(err) });
                        }
                        else { _retries[key]++ } // max wait is only done once
                    }
                    else { _retries[key] =  1 }
                }
            });
        }
    }
}

function connectParentOf(sourceRID, targetRID) {    
    _session.command('CREATE EDGE ParentOf FROM ' + sourceRID +'  TO ' + targetRID)    
    .on('data',(results)=> {
        updateToBeProcessed(targetRID)
    }) 
    .on('error',(err)=> {
        var msg = '' + err
        if(msg.indexOf('UPDATE') > 0) {
            console.log('Retrying connectParentOfDirect for ' + sourceRID + ' to ' + targetRID)
            connectParentOf(sourceRID, targetRID)
        }
        else{
            console.error(msg)
        }
    })   
}
