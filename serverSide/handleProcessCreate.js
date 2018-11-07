const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from processcreate")

// a fix function name that is used within startLiveQuery
function eventHandler(newpc) {
    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { 
        if(err) console.log(err) 
        //console.log('Wrote to cache ' + newpc['Image'])
    });
    if(newpc['ParentImage'] != 'System') {
        //console.log('Handling ' + newpc['Image'])
        fs.readFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], function(err, sourceRID){
            if(err) { // not in cache, find in database
                //console.log('Cannot find in cache... ' + newpc['Hostname'] + newpc['ParentProcessGuid'])
                RetryConnectParentOf(newpc, 0);                
            }
            else {
                //console.log('Found in cache ' + sourceRID)
                connectParentOfDirect(sourceRID,newpc['@rid'])
            }
        })       
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
    if(retryCount > 3) {
        console.log('Give up retrying for ' + newpc['@rid'] + ' ' + newpc['Hostname'] + ':' + newpc['Image'])
        return
    }
    fs.readFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], function(err, sourceRID){
        if(err) {
            console.log('Searching database for parent of ' + newpc['Image'])
            _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
            { params : {guid: newpc['ParentProcessGuid'], hostname: newpc['Hostname']}})
            .on("data", data => {                
                if(data['@rid']) {
                    connectParentOfDirect(data['@rid'],newpc['@rid'])
                    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], data['@rid'], function(err) { 
                        if(err) console.log(err);
                    });
                }
                else {
                    console.log(retryCount + " times for RetryConnectParentOf " + newpc['Image'])
                    RetryConnectParentOf(newpc, retryCount++)
                }
            })
            return
        }
        connectParentOfDirect(sourceRID,newpc['@rid'])
    })
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
