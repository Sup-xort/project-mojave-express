// plan.md 섹션 7 — 에러 코드와 화면 문구. 손님에게는 이 표에 정의된 문구만 노출한다.
const ERRORS = {
  NICKNAME_TAKEN: { status: 409, message: '이미 사용 중인 별명이에요' },
  INVALID_NICKNAME: { status: 400, message: '별명은 1~12자로 지어주세요' },
  INVALID_PIN_FORMAT: { status: 400, message: 'PIN은 숫자 4자리예요' },
  INVALID_CREDENTIALS: { status: 401, message: '별명 또는 PIN이 맞지 않아요' },
  ACCOUNT_LOCKED: { status: 429, message: '잠시 후 다시 시도해주세요' },
  IP_RATE_LIMITED: { status: 429, message: '잠시 후 다시 시도해주세요' },
  UNAUTHORIZED: { status: 401, message: '로그인이 필요해요' },
  INVALID_QR: { status: 400, message: '인식할 수 없는 코드예요' },
  EXPIRED_QR: { status: 400, message: '코드가 만료됐어요. 다시 스캔해주세요' },
  ALREADY_USED: { status: 409, message: '이미 사용된 코드예요' },
  NOT_ENOUGH_STAMPS: { status: 400, message: '아직 스탬프가 부족해요' },
  REWARD_UNAVAILABLE: { status: 409, message: '지금은 교환할 수 없는 리워드예요' },
  RATE_LIMITED: { status: 429, message: '잠시 후 다시 시도해주세요' },
  SERVER_ERROR: { status: 500, message: '잠시 후 다시 시도해주세요' },
};

class AppError extends Error {
  constructor(code, extra) {
    const def = ERRORS[code] || ERRORS.SERVER_ERROR;
    super(code);
    this.code = code in ERRORS ? code : 'SERVER_ERROR';
    this.status = def.status;
    this.publicMessage = def.message;
    this.extra = extra; // 응답에 추가로 실을 필드 (예: ACCOUNT_LOCKED의 남은 초)
  }
}

function appError(code, extra) {
  return new AppError(code, extra);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.publicMessage, ...err.extra });
    return;
  }
  // 스택 트레이스·SQL·내부 경로는 로그에만 남기고 응답에는 절대 포함하지 않는다.
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'SERVER_ERROR', message: ERRORS.SERVER_ERROR.message });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: '찾을 수 없어요' });
}

module.exports = { ERRORS, AppError, appError, errorHandler, notFoundHandler };
