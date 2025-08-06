-- Оновлення існуючих записів debt_payments
-- Встановлюємо creator_id як debtor_id для всіх існуючих записів

UPDATE debt_payments 
SET creator_id = (
    SELECT debtor_id 
    FROM debts 
    WHERE debts.id = debt_payments.debt_id
)
WHERE creator_id IS NULL OR creator_id = '00000000-0000-0000-0000-000000000000'; 