/*
	This is a Dynamic Hook function. Using console:
    alter class parentof Superclass +OTriggered
    alter class parentof CUSTOM onAfterCreate='UpdateSequence'
*/

var db = orient.getDatabase();

function linkSequenceToProcessCreate(sequenceRid) {
  for(var i = 0; i < 3; i++){ //retry mechanism
  	try{ 
      db.command('CREATE EDGE SequenceSighted FROM ? TO ?', sequenceRid, doc.field('in').field('@rid'))
      break;
    }
    catch(err){
      var e = '' + err
	  if(e.indexOf('UPDATE') >= 0) continue;
    }
  }
}

var exename = doc.field('in').field('Image').split("\\")
exename = exename[exename.length - 1]
for(var i = 0; i < 6; i++){ //retry mechanism
  try{
      var prevSeq = '' + doc.field('out').field('Sequence');
      if(prevSeq.indexOf('System') < 0) {
        print('Found partial sequence, attempt to fix: ' + prevSeq)
      var ps = db.query('SELECT GetParentOfSequence(?) as seq', doc.field('out').field('@rid'))
        prevSeq = ps[0].field('seq')
        if(prevSeq.indexOf('System') < 0) continue;
        print('Sequence from GetParentOfSequence: ' + prevSeq);
        db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('out').field('@rid'), prevSeq)
      }
      var s = db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('in').field('@rid'),
                prevSeq + ' > ' + exename) //updates ProcessCreate vertice
      
      var sc = db.command('UPDATE ParentOfSequence SET Count = Count + 1 \
      UPSERT RETURN AFTER @rid, Count, Score WHERE Sequence = ?',s[0].field('Sequence')) 
      
      print(s[0].field('Sequence') + '|' + sc[0].field('Count'));
      if(sc[0].field('Score') > 0 || sc[0].field('Count') == 1) linkSequenceToProcessCreate(sc[0].field('@rid'))
    
      break;
  }
  catch(err){
      var e = '' + err
  if(e.indexOf('UPDATE') >= 0) continue; 
  }
}