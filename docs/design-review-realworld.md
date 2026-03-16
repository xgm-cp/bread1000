# 천원빵 DB 설계 – 실무 기준 검토

## 1. 결론부터

**전체적으로 실무에서 써도 되는 설계다.**  
요구사항(회원·예측·종가·빵 잔액·거래 로그)에 맞게 테이블이 나뉘어 있고, PK/FK/역할도 분명하다. 아래 몇 가지만 채우면 더 안정적으로 쓸 수 있다.

---

## 2. 잘 되어 있는 부분

| 항목 | 내용 |
|------|------|
| **테이블 분리** | 회원·종가·예측·계좌·거래내역 역할이 나뉘어 있어서 정규화·유지보수에 유리함. |
| **PK** | 테이블마다 `id` BIGSERIAL 단일 PK → JOIN·FK 관리가 단순함. |
| **FK** | account_master → members, prediction_master → members, account_transactions → account_master 관계가 명확함. |
| **1인 1계좌** | account_master.member_id UNIQUE(또는 추가 필요)로 회원당 계좌 1개 보장. |
| **중복 예측 방지** | prediction_master UNIQUE(member_id, trade_date)로 같은 날 두 번 예측 불가. |
| **거래 로그** | account_transactions로 잔액 변동 전부 기록 → 감사·정산·복구에 유리함. |
| **날짜당 종가 1건** | closing_price_master.trade_date UNIQUE(또는 추가 필요)로 데이터 일관성 유지. |

이 정도면 실무에서 “잘 설계된 서비스용 DB”에 들어가는 수준이다.

---

## 3. 실무에서 보강하면 좋은 것

ERD에서 내보낸 DDL만 쓸 때, 아래는 있으면 더 낫다.

### 3.1 제약 (없으면 나중에 버그·이상 데이터 가능)

| 테이블 | 제약 | 이유 |
|--------|------|------|
| members | email **UNIQUE** | 로그인·중복 가입 방지 |
| account_master | member_id **UNIQUE** | 1인 1계좌 보장 |
| account_master | balance **DEFAULT 0** | 신규 계좌 초기값 |
| closing_price_master | trade_date **UNIQUE** | 날짜당 종가 1건 |
| closing_price_master | kospi_close **CHECK(>= 0)** | 음수 종가 방지 |
| prediction_master | **UNIQUE(member_id, trade_date)** | 같은 날 중복 예측 방지 |
| prediction_master | predicted_value **CHECK(>= 0)** | 음수 예측 방지 |
| account_transactions | transaction_type **CHECK(IN (...))** | 잘못된 거래 구분 방지 |

### 3.2 FK 동작

- **ON DELETE CASCADE**  
  회원 삭제 시 해당 계좌·예측·거래까지 같이 지울지 정책에 따라 결정.  
  “회원 삭제 = 계좌·예측도 삭제”로 갈 거면 account_master, prediction_master FK에 `ON DELETE CASCADE` 두는 게 실무에서 흔한 패턴이다.

### 3.3 인덱스 (조회 많아지면 필요)

- `account_transactions(account_id)` → 계좌별 거래 목록
- `account_transactions(account_id, created_at)` → “최근 N건” 조회 시 유리
- `prediction_master(trade_date)`, `prediction_master(member_id)` → 당일 예측·회원별 이력
- `closing_price_master(trade_date)` → 날짜로 종가 조회 (UNIQUE면 인덱스도 자동)

### 3.4 선택 사항

- **game_rounds**  
  날짜별 게임 상태·1등 캐시용 테이블. 없어도 종가·예측만으로 1등 계산 가능하지만, 있으면 “오늘 게임 상태/1등” 조회가 단순해진다.
- **회원 가입 시 계좌 자동 생성**  
  트리거 또는 앱에서 `members` INSERT 후 `account_master` 1건 INSERT. 안 하면 “가입했는데 계좌 없음” 처리를 앱에서 꼭 해줘야 한다.
- **members.role**  
  관리자/일반 구분용. 수기 충전·출금을 관리자만 하게 할 거면 있으면 좋다.

---

## 4. 정리

- **전체 설계**  
  실무 기준으로 보면 **괜찮고, 그대로 써도 되는 수준**이다.
- **지금 DDL(ERD 내보내기)**  
  PK/FK는 갖춰졌고, **UNIQUE / CHECK / DEFAULT** 만 위 표처럼 채워 주면 더 안전하다.
- **필수는 아님 but 권장**  
  인덱스, 회원 가입 시 계좌 생성(트리거 또는 앱), 필요하면 game_rounds·role 추가.

요약하면, **설계 방향은 실무 기준에 맞고**, 제약·인덱스·트리거만 조금 보강하면 된다.
