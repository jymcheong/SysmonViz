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

setInterval(function(){ processQueue()},100); 

function processQueue(){
    if(_processCreateQ.length == 0){ return; }
    var newpc = _processCreateQ[0];
    var parentRID = _mapProcessCreate.get(newpc['Hostname'] + newpc['ParentProcessGuid'])
    if(parentRID) {
        if(newpc['ParentImage'] == 'C:\\Windows\\System32\\svchost.exe' && newpc['Image'] == 'C:\\Windows\\System32\\wininit.exe') {
            console.log('Circular path found... ' + newpc['@rid']) // the following fixes a Sysmon BUG
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
                    console.log('Cannot find smss.exe, give up...')
                    _processCreateQ.shift()
                }
            })
        }
        else {
            connectParentOf(parentRID, newpc['@rid'])
            _processCreateQ.shift()
        }
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
            else {
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

/*
function linkSequenceToProcessCreate(sourceRID, targetRID, edgeClass) {
    _session.command('CREATE EDGE '+ edgeClass +' from ' + sourceRID + ' TO ' + targetRID)
    .on('data', (ss) => {
        //console.log('Created '+ edgeClass +' for ' + targetRID)
    })
    .on('error',(err)=> {
        var msg = '' + err
        if(msg.indexOf('UPDATE') > 0) {
            linkSequenceToProcessCreate(sourceRID, targetRID, edgeClass)
        }
        else{
            console.error(msg)
        }
    })
}

function updateParentOfSequence(targetRID, retry){
    if(retry > 3) {
        console.log('Give up try for ' + targetRID)
        return
    }
    retry += 1
    // target is a ProcessCreate object
    _session.query("SELECT GetParentOfSequence('"+ targetRID + "') as seq")
    .on('data',(s)=> {
        if(s['seq'].indexOf('circular') > 0) {
            console.error('Circular path detected!')
            return
        }
        if(s['seq'].indexOf('smss.exe >') < 0 || s['seq'] == 'smss.exe > winlogon.exe') {
            console.log('Partial sequence found, retrying '+ retry + ' ' + s['seq'])
            setTimeout(function(){eval('updateParentOfSequence(targetRID,'+ retry + ')')},2000)
            return
        }
        _session.command('UPDATE ParentOfSequence set Sequence = :seq, Count = Count + 1 \
                         UPSERT RETURN AFTER @rid, Count, Score WHERE Sequence = :seq',{ params : {seq: s['seq']}})
        .on('data',(c)=> {
            console.log('Sequence count:'+ c['Count'] + ':' + s['seq'])
            if(c['Count'] == 1) { // first-sighting
                linkSequenceToProcessCreate(c['@rid'],targetRID,'SequenceSighted')
                _session.query('SELECT AddSequenceWatchlist(' + targetRID + ')')
                .on('error', (err)=>{
                    console.error(err)
                })
            }
            else {
                if(c['Score'] > 0) { // to handle 2nd patient, patient zero is handled by Count = 1
                    linkSequenceToProcessCreate(c['@rid'],targetRID,'SequenceSighted') 
                }
                else {
                    linkSequenceToProcessCreate(targetRID,c['@rid'],'hasSequence')
                }
            }
        })
    })
}

*/