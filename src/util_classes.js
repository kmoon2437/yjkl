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
    constructor(){
        this.name = 'LineSeparate';
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
    constructor(start,end,currentBPM,splitTimes,splitRatio){
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
    ChangeBPM,Duration,
    
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent
};