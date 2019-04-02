# Sysmon Visualization (SysmonViz)

## Why?
**SysmonViz is not meant for production but for exploration of Window system behavior**. I have yet to test it on a larger network with high event rate. Sysmon itself also has certain limitations. It is useful to understand what's going on within a Windows host at a "mid-level" granularity as oppose to deep instrumentation down to the APIs or machine instructions level.

EDR are too expensive for students & enthusiasts, most of the Sysmon visualization I have seen so far are "batch-offline" based & can be tedious. It is part of a method which I came up known as User-Action-Tracking: https://www.linkedin.com/pulse/user-action-tracking-jym-cheong/ . In the article, I stressed the need to better understand what is usual/normal user activities/use-cases so that we can triage better.

I needed a reason to tinker with NodeJS & a graph database & this is a good one. Please forgive me if some of the Javascript codes are horrible! It is part of my other projects:

* [Automated Payload Test Controller](https://github.com/jymcheong/aptc)
* [Automated Tactics Techniques & Procedures](https://github.com/jymcheong/AutoTTP)
* Hardcoding credentials into script is a bad idea, try to use it with [One-way Transport of System Event Logs via SFTP](https://github.com/jymcheong/OneWaySFTP) for > 1 client Windows to visualize
* [Sysmon Resources](https://github.com/jymcheong/SysmonResources)



## How does it look like?

![](images/smss.png)

Short demo: https://www.youtube.com/watch?v=Ct-hDKOga_E

Much of the database schema was derived from [SwiftOnSecurity's sysmon configuration](https://github.com/SwiftOnSecurity/sysmon-config). 

## Getting Started

SysmonViz uses a multi-model database ([OrientDB Community Edition](https://orientdb.com/community/)) as datastore & visualization backend. Most functions are implemented within the database server-side functions.

**Install the backend first** before proceeding to the client Windows (virtual) machine.  Much of the installations are automated by scripting except the part to change your OrientDB hostname/IP for the *[filemonitor.js](https://raw.githubusercontent.com/jymcheong/SysmonViz/master/filemonitor.js#L6)* script. 

### Windows based OrientDB 

**Please ensure Java 8+ runtime is installed**. Use an **admin CMD console** & paste the following ([review script source](https://raw.githubusercontent.com/jymcheong/SysmonViz/master/installationScripts/installorientDB.ps1)):

```
cd %userprofile%\desktop
powershell -nop -c "iex(New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/jymcheong/SysmonViz/master/installationScripts/installorientDB.ps1')"
```

### *nix based OrientDB

Please ensure **wget** & **Java** **8+ runtime** are installed. Download the [installation script](https://raw.githubusercontent.com/jymcheong/SysmonViz/master/installationScripts/installorientDB.sh). Chmod +x the script file & run it.

### Windows Client (tested on 7-10 32/64bit) 

1. For Windows 7, please install Powershell 5

2. Use an **admin CMD console** 

3. Replace YOURSERVERIP below with your OrientDB server IP

4. Paste into CMD console to execute  

   ([review script source](https://raw.githubusercontent.com/jymcheong/SysmonViz/master/installationScripts/installsysmonviz.ps1)):

```
cd %userprofile%\desktop
powershell -nop -c "$odbserver='YOURSERVERIP';iex(New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/jymcheong/SysmonViz/master/installationScripts/installClientSide.ps1')"
```

Please ensure that the Windows (to-be-monitored) host can communicate with your OrientDB server. ***ie. Able to visit OrientDB web admin page with the host's browser.***

Do take a look at some of the [useful queries in the wiki section](https://github.com/jymcheong/SysmonViz/wiki/Useful-queries).
