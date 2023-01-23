const parseCommand = require('command-line-args');

var opts = {};

/**
 * bpm 설정
 */
opts['bpm'] = [];

/**
 * 해당 절의 가사가 시작하기 얼마나 전에 가사를 표시할지 설정
 */
opts['show'] = [];

/**
 * 몇부터 카운트할지 설정. 최대값은 4
 */
opts['count'] = [];

/**
 * 틱단위로 delay를 넣음(`d 숫자` 로 대체됨)
 */
opts['delay'] = [];

/**
 * delay와 같으나 밀리초 단위 (mr반주 전용)
 */
opts['delay_ms'] = [];

/**
 * 플래그 설정
 */
opts['flag'] = [{
    // 3줄 가사의 제일 윗줄 표시용
    // (이름은 기존 제일 윗줄보다 더 윗줄을 의미함)
    name:'upper',type:Boolean,defaultValue:false
}];

module.exports = class Commands{
    static parse(cmdStr){
        // 명령어 이름을 없애고 파싱
        return {
            name:cmdStr.split(/ +/g)[0],
            opts:parseCommand(opts[cmdStr.split(/ +/g)[0].toLowerCase()] || [],{
                argv:cmdStr.split(/ +/g).slice(1),
                partial:true
            })
        };
    }
}