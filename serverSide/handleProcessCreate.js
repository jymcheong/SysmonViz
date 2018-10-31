const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from processcreate")

// a fix function name that is used within startLiveQuery
function eventHandler(newpc) {
    // write new @rid to cache folder
    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { if(err) console.log(err) });
    // find parent @rid in cache
    fs.readFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], function(err, parentrid){
        if(err) { // not in cache, find in database
            console.log('Cannot find parent rid in cache, trying database...')
            _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
            { params : {guid: newpc['ParentProcessGuid'], hostname: newpc['Hostname']}})
            .all()
            .then((results)=> {
                if(results.length == 0) {
                    console.log('cannot find parent for ' + newpc['@rid'])
                    return
                }
                fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], results[0]['@rid'], function(err) { if(err) console.log(err) });
                connectParentOf(results[0]['@rid'], newpc['@rid'])
            });
            return
        }
        connectParentOf(parentrid, newpc['@rid'])
    })   
}

function connectParentOf(sourceRID, targetRID) {
    console.log('creating ParentOf from ' + sourceRID + ' to ' + targetRID)
    _session.command('CREATE EDGE ParentOf FROM ' + sourceRID + ' TO ' + targetRID)
    .on('data',(results)=> {
        _session.command('Update ' + targetRID + 'SET ToBeProcessed = false')
        .on('error',(err)=> {
            console.log(err)
            console.log('Retrying update within connectParentOf...')
            _session.command('Update ' + targetRID + 'SET ToBeProcessed = false')
        })
        .on('data',(data)=> {
            console.log('updated processcreate ' + targetRID)
            // do 'gaps once here
        }) //*/
        _session.query("SELECT GetParentOfSequence('"+ targetRID + "') as seq")
        .on('data',(s)=> {
            _session.command('UPDATE ParentOfSequence set Sequence = :seq, Count = Count + 1 \
                             UPSERT RETURN AFTER @rid, Count WHERE Sequence = :seq',{ params : {seq: s['seq']}})
            .on('data',(c)=> {
                console.log('Sequence count: '+ c['Count'] + ' -> ' + s['seq'])
                if(c['Count'] == 1) {
                    _session.command('CREATE EDGE SequenceSighted from ' + c['@rid'] + ' TO ' + targetRID)
                    .on('data', (ss) => {
                        console.log('Created SequenceSighted for ' + targetRID)
                    })
                }
            })
        })
    })
    .on('error',(err)=> {
        console.log('Retrying creating ParentOf from ' + sourceRID + ' to ' + targetRID)
        connectParentOf(sourceRID, targetRID)
    })
}

