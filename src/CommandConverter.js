const Commands = require('./Commands');
const Parser = require('./Parser');
const {
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent,ChangeBPM
} = require('./util_classes');

const STAKATO_MS = 10;
const STAKATO_TICK = 1;

module.exports = class CommandConverter{
    // 기존 방식(기본값). tick 단위를 밀리초로 변환
    // tick 단위와 밀리초 단위를 같이 쓸수 있지만 bpm 수동지정 필수(기본bpm 120)
    // midi/yjk 파일의 경우 기본적으로 밀리초 단위가 비활성화됨(mr반주에서는 무조건 활성화)
    // (enable-msec:true 헤더 또는 Converter.convert() 함수의 opts.enableMsec을 true로 하면 활성화 가능)
    static parseCommandWithStdDuration(commands,headers,enableMsec){
        var bpm = 120;
        var stringEvents = [];
        var ticksPerBeat = headers.meta['ticks-per-beat'];
        var playtime = 0;
        for(var cmd of commands){
            switch(cmd.type.toLowerCase()){
                case 'c':{
                    let { name,opts } = Commands.parse(cmd.cmd);
                    let { _unknown:args } = opts;
                    switch(name.toLowerCase()){
                        case 'bpm':{
                            bpm = Parser.parseNumber(args[0]);
                        }break;
                        case 'show':{
                            stringEvents.push(new SetVerseProperty('waitTime',Parser.parseStdDuration(args[0],bpm,ticksPerBeat,enableMsec,false).reduce((a,b) => a+b.ms,0)));
                        }break;
                        case 'count':{
                            stringEvents.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parseStdDuration(args[0],bpm,ticksPerBeat,enableMsec,false).reduce((a,b) => a+b.ms,0);
                        }break;
                        case 'delay_ms':{
                            if(enableMsec) playtime += Parser.parseNumber(args[0]);
                        }break;
                    }
                }break;
                case 'd':{
                    playtime += Parser.parseStdDuration(cmd.delay,bpm,ticksPerBeat,enableMsec,false).reduce((a,b) => a+b.ms,0);
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parseStdDuration(time,bpm,ticksPerBeat,enableMsec);
                        let splitTimes = [];
                        let splitRatio = [];
                        let notChangedBPM = bpm;
                        let addNextTiming = false;
                        parsed.forEach(a => {
                            if(a instanceof ChangeBPM){
                                bpm = a.bpm;
                                addNextTiming = a.addNextTiming;
                            }else{
                                if(addNextTiming){
                                    splitTimes[splitTimes.length-1] += (playtime += a.ms);
                                    addNextTiming = false;
                                }else{
                                    splitTimes.push(playtime += a.ms);
                                    splitRatio.push(a.ratio);
                                }
                            }
                        });
                        splitTimes.pop();
                        //playtime += parsed.ms;
                        let end = parsed[parsed.length-1].stakato ? (splitTimes[splitTimes.length-1] || start)+STAKATO_MS : playtime;
                        stringEvents.push(new TimingEvent(Math.round(start),Math.round(end),notChangedBPM,splitTimes,splitRatio));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let endTime = cmd.endTime;
                        stringEvents.push(new VerseSeparate((typeof cmd.endTime != 'undefined')
                        ? Parser.parseStdDuration(endTime,bpm,ticksPerBeat,enableMsec,false).reduce((a,b) => a+b.ms,0) : 0));
                    }else{
                        stringEvents.push(new LineSeparate(cmd.forceStartCount));
                    }
                }break;
                case 's':{
                    stringEvents.push(new SetLineProperty('txt',cmd.sentence));
                }break;
                case 'u':{
                    stringEvents.push(new SetLineProperty('sub',cmd.sentence));
                }break;
                case 'p':{
                    stringEvents.push(new SetLineProperty('type',cmd.typecode));
                }break;
            }
        }

        return stringEvents;
    }

    // 새로운 방식(Tempo-changes 헤더가 있는 경우)
    // 틱과 밀리초를 같이 사용 불가
    // 여기서 tick단위로 계산한 걸 Tempo-changes 헤더를 가지고 밀리초로 변환
    static parseCommandWithPlaytimeDuration(commands,headers){
        var stringEvents = [];
        var playtime = 0;
        for(var cmd of commands){
            switch(cmd.type.toLowerCase()){
                case 'c':{
                    let { name,opts } = Commands.parse(cmd.cmd);
                    let { _unknown:args } = opts;
                    switch(name.toLowerCase()){
                        case 'show':{
                            stringEvents.push(new SetVerseProperty('waitTime',Parser.parsePlaytimeDuration(args[0]).reduce((a,b) => a+b.time,0)));
                        }break;
                        case 'count':{
                            stringEvents.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parsePlaytimeDuration(args[0]).reduce((a,b) => a+b.time,0);
                        }break;
                    }
                }break;
                case 'd':{
                    playtime += Parser.parsePlaytimeDuration(cmd.delay).reduce((a,b) => a+b.time,0);
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parsePlaytimeDuration(time);
                        let splitTimes = [];
                        let splitRatio = [];
                        parsed.forEach(a => {
                            splitTimes.push(playtime += a.time);
                            splitRatio.push(a.ratio);
                        });
                        splitTimes.pop();
                        //playtime += parsed.ms;
                        let end = parsed[parsed.length-1].stakato ? (splitTimes[splitTimes.length-1] || start)+STAKATO_TICK : playtime;
                        stringEvents.push(new TimingEvent(Math.round(start),Math.round(end),0,splitTimes,splitRatio));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let endTime = cmd.endTime;
                        stringEvents.push(new VerseSeparate((typeof cmd.endTime != 'undefined')
                        ? Parser.parsePlaytimeDuration(endTime).reduce((a,b) => a+b.time,0) : 0));
                    }else{
                        stringEvents.push(new LineSeparate(cmd.forceStartCount));
                    }
                }break;
                case 's':{
                    stringEvents.push(new SetLineProperty('txt',cmd.sentence));
                }break;
                case 'u':{
                    stringEvents.push(new SetLineProperty('sub',cmd.sentence));
                }break;
                case 'p':{
                    stringEvents.push(new SetLineProperty('type',cmd.typecode));
                }break;
            }
        }

        return stringEvents;
    }
}