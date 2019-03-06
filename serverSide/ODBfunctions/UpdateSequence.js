/*
	This is a Dynamic Hook function. Using console:
    alter class parentof Superclass +OTriggered
    alter class parentof CUSTOM onAfterCreate='UpdateSequence'
*/

var db = orient.getDatabase();

function linkSequenceToProcessCreate(sequenceRid, edgeClass) {
  for(var i = 0; i < 3; i++){ //retry mechanism
  	try{ // one edge is PC -> Sequence , the other is Sequence -> PC
      if(edgeClass == 'hasSequence') db.command('CREATE EDGE ' + edgeClass + ' FROM ? TO ?', doc.field('in').field('@rid'), sequenceRid)
      if(edgeClass == 'SequenceSighted') db.command('CREATE EDGE ' + edgeClass + ' FROM ? TO ?', sequenceRid, doc.field('in').field('@rid'))
      break;
    }
    catch(err){
      var e = '' + err
	  if(e.indexOf('UPDATE') >= 0) continue;
    }
  }
}

function updateSequence(){
	var exename = doc.field('in').field('Image').split("\\")
    exename = exename[exename.length - 1]
    for(var i = 0; i < 6; i++){ //retry mechanism
      try{
         var prevSeq = '' + doc.field('out').field('Sequence');
         if(prevSeq.indexOf('System') < 0) {
            print('Found partial sequence, attempt to fix...')
         	var ps = db.query('SELECT GetParentOfSequence(?) as seq', doc.field('out').field('@rid'))
            prevSeq = ps[0].field('seq')
            if(prevSeq.indexOf('System') < 0) continue;
            db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('out').field('@rid'), prevSeq)
         }
         var s = db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('in').field('@rid'),
                   prevSeq + ' > ' + exename) //updates ProcessCreate vertice
         
         var sc = db.command('UPDATE ParentOfSequence SET Count = Count + 1 \
				  UPSERT RETURN AFTER @rid, Count, Score WHERE Sequence = ?',s[0].field('Sequence')) 
         
         print(sc[0].field('Count') + '|'+ s[0].field('Sequence'));
         var edgeClass = sc[0].field('Score') > 0 || sc[0].field('Count') == 1 ? 'SequenceSighted' : 'hasSequence';
		 linkSequenceToProcessCreate(sc[0].field('@rid'), edgeClass)
         break;
      }
      catch(err){
         var e = '' + err
		 if(e.indexOf('UPDATE') >= 0) continue; 
      }
    }
}

updateSequence()
// Partial sequence are those with missing "System > " 