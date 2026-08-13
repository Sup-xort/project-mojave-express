// 형용사+명사 조합. 각 단어를 짧게 유지해 조합 결과가 항상
// utils/nickname.js의 MAX_LEN(12자) 안에 들어오게 한다.
const ADJECTIVES = [
  '조용한', '느긋한', '달콤한', '몽글한', '푸른',
  '따뜻한', '서늘한', '나른한', '고요한', '눈부신',
  '수줍은', '엉뚱한', '든든한', '가벼운', '촉촉한',
  '아득한', '말랑한', '반짝인', '어스름', '늦은밤',
];

const NOUNS = [
  '산책자', '몽상가', '방랑자', '여우', '고양이',
  '올빼미', '나그네', '탐험가', '수집가', '항해사',
  '연주자', '이야기꾼', '구름', '파도', '별빛',
  '골목길', '한잔', '재즈', '바이닐', '단골',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomNickname() {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

module.exports = { randomNickname };
