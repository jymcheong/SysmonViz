var db = orient.getDatabase();
var circularCheck = {} //each @rid should only be seen ONCE.

function findParent(n, s) { // start from leaf child node
  if(circularCheck[n] === undefined) {
     circularCheck[n] = 1
  }
  else {
     print('circular path detected')
  	 return s
  }
  var separator = s.length > 0 ? ' > ' : '';
  var r = db.query('select from ' + n)
  if(r.length == 0) return s; // no record, don't proceed
  
  // reached dead-end (circular path handled earlier)
  if(r[0].getProperty('in_ParentOf') == null) {
    var i = r[0].getProperty('Image').split("\\")
    return (i[i.length-1] + separator + s)      
  }
  //print('in_ParentOf RID = ' + r[0].getProperty('in_ParentOf'))
  var p = db.query('select expand(out) from ' + r[0].getProperty('in_ParentOf').toString().replace('[','').replace(']',''))
  var i = r[0].getProperty('Image').split("\\")
  return findParent(p[0].getProperty('@rid'), i[i.length-1] + separator + s);
}
var parentof = findParent(startrid,'')
//print(parentof)
return parentof