const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from processcreate")

var _mapProcessCreate = new Map()

// a fix function name that is used within startLiveQuery
function eventHandler(newpc) {
    var rid = '' + newpc['@rid']
    _mapProcessCreate.set(newpc['Hostname'] + newpc['ProcessGuid'], rid)
    console.log('Wrote map ' + _mapProcessCreate.get(newpc['Hostname'] + newpc['ProcessGuid']))
    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { 
        if(err) console.log(err) 
        //console.log('Wrote to cache ' + newpc['Image'])
    });
    if(newpc['ParentImage'] != 'System') {
        //console.log('Handling ' + newpc['Image'])
        var sourceRID = _mapProcessCreate.get(newpc['Hostname'] + newpc['ParentProcessGuid'])
        if(sourceRID) {
            connectParentOfDirect(sourceRID,newpc['@rid'])
        }
        else {
            RetryConnectParentOf(newpc, 1);  
        }
        /*
        fs.readFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], function(err, sourceRID){
            if(err) { // not in cache, find in database
                //console.log('Cannot find in cache... ' + newpc['Hostname'] + newpc['ParentProcessGuid'])
                RetryConnectParentOf(newpc, 0);                
            }
            else {
                //console.log('Found in cache ' + sourceRID)
                connectParentOfDirect(sourceRID,newpc['@rid'])
            }
        }) */      
    }
}

function connectParentOfDirect(sourceRID, targetRID) {    
    //console.log('CREATE EDGE ParentOf FROM ' + sourceRID +' TO ' + targetRID)
    _session.command('CREATE EDGE ParentOf FROM ' + sourceRID +' TO ' + targetRID)    
    .on('data',(results)=> {
        updateToBeProcessed(targetRID)
        updateParentOfSequence(targetRID)
    }) 
    .on('error',(err)=> {
        console.log('Retrying connectParentOfDirect for ' + sourceRID + ' to ' + targetRID)
        connectParentOfDirect(sourceRID, targetRID)
    })   
}

function RetryConnectParentOf(newpc, retryCount) {
    console.log('RetryConnectParentOf ' + newpc['Image'] + ':' + retryCount)
    if(retryCount > 3) {
        console.log('Give up retrying for ' + newpc['@rid'] + ' ' + newpc['Hostname'] + ':' + newpc['Image'])
        return
    }
    var sourceRID = _mapProcessCreate.get(newpc['Hostname'] + newpc['ParentProcessGuid'])
    if(sourceRID) {
        connectParentOfDirect(sourceRID,newpc['@rid'])
    }
    else {
        retryCount = retryCount + 1
        RetryConnectParentOf(newpc, retryCount);  
    }
}


function updateParentOfSequence(targetRID){
    _session.query("SELECT GetParentOfSequence('"+ targetRID + "') as seq")
    .on('data',(s)=> {
        _session.command('UPDATE ParentOfSequence set Sequence = :seq, Count = Count + 1 \
                         UPSERT RETURN AFTER @rid, Count WHERE Sequence = :seq',{ params : {seq: s['seq']}})
        .on('data',(c)=> {
            console.log('Sequence count: '+ c['Count'] + ':' + s['seq'])
            if(c['Count'] == 1) {
                _session.command('CREATE EDGE SequenceSighted from ' + c['@rid'] + ' TO ' + targetRID)
                .on('data', (ss) => {
                    console.log('Created SequenceSighted for ' + targetRID)
                })
            }
        })
    })
}
