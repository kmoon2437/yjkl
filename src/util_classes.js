/**
 * 갖가지 작은 클래스들 모음
 */
 
/**
 * Parser.parseDuration() 용
 */
class ChangeBPM{
    constructor(bpm){
        this.bpm = bpm;
    }
}

class Duration{
    constructor(time,ratio = 1,stakato = false){
        this.time = parseFloat(time instanceof Array ? time[0] : time);
        this.time2 = parseFloat(time instanceof Array ? time[1] : 0);
        this.ratio = ratio;
        this.stakato = stakato;
    }
}

class MsDuration{
    constructor(ms,ratio = 1,stakato = false){
        this.ms = ms;
        this.ratio = ratio;
        this.stakato = stakato;
    }
}

/**
 * Converter.convert()의 stringEvents 관련
 */
class LineSeparate{
    constructor(forceStartCount){
        this.name = 'LineSeparate';
        this.forceStartCount = forceStartCount;
    }
}

class VerseSeparate{
    constructor(ms){
        this.name = 'VerseSeparate';
        this.hideDelay = ms;
    }
}

class SetLineProperty{
    constructor(key,val){
        this.name = 'SetLineProperty';
        this.key = key;
        this.val = val;
    }
}

class SetVerseProperty{
    constructor(key,val){
        this.name = 'SetVerseProperty';
        this.key = key;
        this.val = val;
    }
}

class TimingEvent{
    constructor(start,end,currentBPM,splitTimes = [],splitRatio = [1]){
        // 시작시간
        this.start = start;
        
        // 끝시간
        this.end = end;
        
        // 현재 bpm
        this.currentBPM = currentBPM;
        
        // 한 글자를 여러개로 쪼갤경우 쪼개지는 기준 시간
        this.splitTimes = splitTimes;
        
        // 한 글자를 여러개로 쪼갤경우 쪼개는 비율
        // splitTimes에 아무것도 없으면 무시됨
        this.splitRatio = splitRatio;
    }
}

module.exports = {
    ChangeBPM,Duration,MsDuration,
    
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent
};