const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function updateDebtPayments() {
  try {
    console.log('Починаю оновлення існуючих записів debt_payments...')
    
    // Знаходимо всі записи debt_payments з неправильним creatorId
    const debtPayments = await prisma.debtPayment.findMany({
      where: {
        creatorId: '00000000-0000-0000-0000-000000000000'
      },
      include: {
        debt: {
          include: {
            debtor: true,
            creditor: true
          }
        }
      }
    })
    
    console.log(`Знайдено ${debtPayments.length} записів для оновлення`)
    
    for (const payment of debtPayments) {
      // Використовуємо debtorId як creatorId (ось хто створював платіж)
      const creatorId = payment.debt.debtorId
      
      await prisma.debtPayment.update({
        where: { id: payment.id },
        data: { creatorId }
      })
      
      console.log(`Оновлено платіж ${payment.id} з creatorId: ${creatorId}`)
    }
    
    console.log('Оновлення завершено успішно!')
  } catch (error) {
    console.error('Помилка при оновленні:', error)
  } finally {
    await prisma.$disconnect()
  }
}

updateDebtPayments() 