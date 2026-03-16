# game_rounds 테이블 – FK 연결 설명

## 1. 테이블 역할

- **해당일 1등이 누구인지** 저장하는 테이블.
- **15:30 장 마감 후**, 종가 반영 + 1등 확정했을 때 **그때 한 번만 INSERT**. 접수중/마감 전에는 INSERT 안 함.
- `game_date` 로 “그날” 구분. 행이 있으면 “그날 결과 있음”, 없으면 “아직 없음”.

---

## 2. FK 연결 (2개)

| FK 이름 | 컬럼 | 참조 테이블 | 참조 컬럼 | 의미 |
|---------|------|-------------|-----------|------|
| **FK_game_rounds_closing** | closing_price_master_id | closing_price_master | id | 해당일 **종가 레코드**. INSERT 시점에 이미 들어가 있는 행의 id. |
| **FK_game_rounds_winner** | winner_id | members | id | 해당일 **1등 회원**. |

- 둘 다 **NOT NULL**. 결과 확정 시에만 넣으므로 그때는 항상 값이 있음.

---

## 3. 생성 순서

`game_rounds`는 **members**, **closing_price_master**를 참조하므로, 이 두 테이블을 **먼저** 만든 다음 실행.

```
1. members
2. closing_price_master
3. account_master
4. prediction_master
5. account_transactions
6. game_rounds   ← 002_game_rounds.sql
```

---

## 4. ERD에서 연결

- **game_rounds** ─(점선, N:1)─→ **closing_price_master** (closing_price_master_id)
- **game_rounds** ─(점선, N:1)─→ **members** (winner_id)

둘 다 비식별 관계(자식 PK에 포함 안 됨)이므로 **점선**으로 연결.
