#!/bin/bash
# Other scripts use this default password. Change the rest if you change the default
export ORIENTDB_ROOT_PASSWORD=Password1234
export ORIENTDB_HOME=`pwd`
wget https://s3.us-east-2.amazonaws.com/orientdb3/releases/3.0.17/orientdb-3.0.17.tar.gz
wget https://raw.githubusercontent.com/jymcheong/SysmonViz/master/schema.gz
wget https://raw.githubusercontent.com/jymcheong/SysmonViz/master/functions.json
tar zxvf orientdb-3.0.17.tar.gz 
orientdb-3.0.17/bin/server.sh &
orientdb-3.0.17/bin/console.sh "create database remote:localhost\DataFusion root $ORIENTDB_ROOT_PASSWORD; import database schema.gz;"
orientdb-3.0.17/bin/console.sh "use remote:localhost\DataFusion root $ORIENTDB_ROOT_PASSWORD; import database functions.json -merge=true;"
