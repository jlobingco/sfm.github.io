import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("finance.db");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slots INTEGER DEFAULT 1,
    status TEXT DEFAULT 'Active',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    amount REAL,
    type TEXT, -- 'Contribution', 'AnnualFee', 'Penalty', 'Refund'
    period TEXT, -- '15th', '30th'
    month TEXT, -- 'YYYY-MM'
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    guarantor_id INTEGER,
    borrower_name TEXT, -- For non-members
    principal REAL,
    interest_rate REAL DEFAULT 0.06,
    months INTEGER DEFAULT 1,
    status TEXT DEFAULT 'Active', -- 'Active', 'Paid'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_at DATETIME,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(guarantor_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS loan_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER,
    amount_paid REAL,
    interest_portion REAL,
    principal_portion REAL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id)
  );
  CREATE TABLE IF NOT EXISTS billing_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    period_date TEXT, -- 'YYYY-MM-15' or 'YYYY-MM-30'
    status TEXT DEFAULT 'Unpaid', -- 'Paid', 'Unpaid', 'PenaltyApplied'
    FOREIGN KEY(member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    amount REAL,
    reason TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id)
  );
`);

// Migration: Add 'period' column to 'transactions' if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
const hasPeriod = tableInfo.some((col: any) => col.name === 'period');
if (!hasPeriod) {
  db.exec("ALTER TABLE transactions ADD COLUMN period TEXT");
}

// Migration: Add 'month' column to 'transactions' if it doesn't exist
const hasMonth = tableInfo.some((col: any) => col.name === 'month');
if (!hasMonth) {
  db.exec("ALTER TABLE transactions ADD COLUMN month TEXT");
}

// Migration: Add 'borrower_name' column to 'loans' if it doesn't exist
const loanTableInfo = db.prepare("PRAGMA table_info(loans)").all();
const hasBorrowerName = loanTableInfo.some((col: any) => col.name === 'borrower_name');
if (!hasBorrowerName) {
  db.exec("ALTER TABLE loans ADD COLUMN borrower_name TEXT");
}

const hasMonths = loanTableInfo.some((col: any) => col.name === 'months');
if (!hasMonths) {
  db.exec("ALTER TABLE loans ADD COLUMN months INTEGER DEFAULT 1");
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // --- API ROUTES ---

  // Global Summary
  app.get("/api/summary", (req, res) => {
    const totalContributions = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'Contribution'").get().total || 0;
    const totalAnnualFees = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'AnnualFee'").get().total || 0;
    const totalPaidLoans = db.prepare("SELECT SUM(principal_portion + interest_portion) as total FROM loan_payments").get().total || 0;
    const activeLoans = db.prepare("SELECT SUM(principal) as total FROM loans WHERE status = 'Active'").get().total || 0;
    const totalRefunds = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'Refund'").get().total || 0;
    const totalPenalties = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE type = 'Penalty'").get().total || 0;
    
    // Dividend Pool (4% of all interest - both paid and active)
    const totalInterestPaid = db.prepare("SELECT SUM(interest_portion) as total FROM loan_payments").get().total || 0;
    const activeLoansInterest = db.prepare("SELECT SUM(principal * 0.06) as total FROM loans WHERE status = 'Active'").get().total || 0;
    const totalInterest = totalInterestPaid + activeLoansInterest;
    const dividendPool = totalInterest * (4/6);
    const totalGuarantorRewards = totalInterest * (2/6);
    
    const cashOnHand = (totalContributions + totalAnnualFees + totalPaidLoans + totalPenalties) - (activeLoans + totalRefunds);

    const totalMembers = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'Active'").get().count || 0;
    const totalSlots = db.prepare("SELECT SUM(slots) as total FROM members WHERE status = 'Active'").get().total || 0;

    res.json({
      cashOnHand,
      totalPortfolio: activeLoans,
      dividendPool,
      totalGuarantorRewards,
      totalPenalties,
      totalMembers,
      totalSlots
    });
  });

  // Members List
  app.get("/api/members", (req, res) => {
    const members = db.prepare("SELECT * FROM members").all();
    res.json(members);
  });

  // Loans List
  app.get("/api/loans", (req, res) => {
    const loans = db.prepare(`
      SELECT l.*, COALESCE(m.name, l.borrower_name) as debtor_name, g.name as guarantor_name 
      FROM loans l
      LEFT JOIN members m ON l.member_id = m.id
      JOIN members g ON l.guarantor_id = g.id
    `).all();
    
    // Add calculated bi-monthly payment and total paid
    const loansWithPayments = loans.map((loan: any) => {
      const totalInterest = loan.principal * loan.interest_rate * loan.months;
      const totalToPay = loan.principal + totalInterest;
      const numPayments = loan.months * 2;
      const biMonthlyPayment = totalToPay / numPayments;
      
      const payments = db.prepare("SELECT SUM(amount_paid) as total FROM loan_payments WHERE loan_id = ?").get(loan.id) as any;
      const amountPaid = payments?.total || 0;
      const remainingBalance = Math.max(0, totalToPay - amountPaid);
      
      return { ...loan, totalInterest, biMonthlyPayment, amountPaid, remainingBalance };
    });
    
    res.json(loansWithPayments);
  });

  // Add Member
  app.post("/api/members", (req, res) => {
    const { name, slots } = req.body;
    
    // Check for duplicate name
    const existing = db.prepare("SELECT id FROM members WHERE name = ?").get(name);
    if (existing) {
      return res.status(400).json({ error: "A member with this name already exists." });
    }

    try {
      const result = db.prepare("INSERT INTO members (name, slots) VALUES (?, ?)").run(name, slots);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Member
  app.put("/api/members/:id", (req, res) => {
    const { id } = req.params;
    const { name, slots, status } = req.body;

    try {
      db.prepare("UPDATE members SET name = ?, slots = ?, status = ? WHERE id = ?")
        .run(name, slots, status || 'Active', id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Member
  app.delete("/api/members/:id", (req, res) => {
    const { id } = req.params;

    try {
      db.transaction(() => {
        // Delete related data first or let foreign keys handle it if configured (they aren't explicitly ON DELETE CASCADE in the schema)
        db.prepare("DELETE FROM transactions WHERE member_id = ?").run(id);
        db.prepare("DELETE FROM penalties WHERE member_id = ?").run(id);
        db.prepare("DELETE FROM billing_periods WHERE member_id = ?").run(id);
        
        // Loans are tricky because they have guarantor_id too
        db.prepare("DELETE FROM loan_payments WHERE loan_id IN (SELECT id FROM loans WHERE member_id = ? OR guarantor_id = ?)").run(id, id);
        db.prepare("DELETE FROM loans WHERE member_id = ? OR guarantor_id = ?").run(id, id);
        
        db.prepare("DELETE FROM members WHERE id = ?").run(id);
      })();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Member Details & Expected Receivable
  app.get("/api/members/:id", (req, res) => {
    const memberId = req.params.id;
    const member = db.prepare("SELECT * FROM members WHERE id = ?").get(memberId);
    
    if (!member) return res.status(404).json({ error: "Member not found" });

    // 1. Total Contribution Principal
    const principal = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'Contribution'").get(memberId).total || 0;
    
    // 2. Total Gained Interest (Proportional share of 4% pool based on SLOTS)
    const totalSlots = db.prepare("SELECT SUM(slots) as total FROM members WHERE status = 'Active'").get().total || 1;
    const totalInterestPaid = db.prepare("SELECT SUM(interest_portion) as total FROM loan_payments").get().total || 0;
    const activeLoansInterest = db.prepare("SELECT SUM(principal * 0.06) as total FROM loans WHERE status = 'Active'").get().total || 0;
    const totalInterest = totalInterestPaid + activeLoansInterest;
    const total4PercentPool = totalInterest * (4/6);
    const dividendShare = (member.slots / totalSlots) * total4PercentPool;

    // 3. Total Guarantor Interest (2% of loans they guaranteed - both paid and active)
    const paidGuarantorInterest = db.prepare(`
      SELECT SUM(lp.interest_portion * (2.0/6.0)) as total 
      FROM loan_payments lp
      JOIN loans l ON lp.loan_id = l.id
      WHERE l.guarantor_id = ?
    `).get(memberId).total || 0;
    const activeGuarantorInterest = db.prepare(`
      SELECT SUM(principal * 0.02) as total FROM loans WHERE guarantor_id = ? AND status = 'Active'
    `).get(memberId).total || 0;
    const guarantorInterest = paidGuarantorInterest + activeGuarantorInterest;

    // 4. Outstanding Payable Loans (Own + Guaranteed)
    const memberLoans = db.prepare(`
      SELECT id, principal, interest_rate, months FROM loans 
      WHERE status = 'Active' 
      AND (member_id = ? OR borrower_name = ? OR guarantor_id = ?)
    `).all(memberId, member.name, memberId);

    let outstandingDebt = 0;
    let currentPrincipalDebt = 0;
    memberLoans.forEach((loan: any) => {
      const totalInterest = loan.principal * loan.interest_rate * loan.months;
      const totalToPay = loan.principal + totalInterest;
      const payments = db.prepare("SELECT SUM(amount_paid) as total, SUM(principal_portion) as principal FROM loan_payments WHERE loan_id = ?").get(loan.id) as any;
      const amountPaid = payments?.total || 0;
      const principalPaid = payments?.principal || 0;
      outstandingDebt += Math.max(0, totalToPay - amountPaid);
      currentPrincipalDebt += Math.max(0, loan.principal - principalPaid);
    });

    // 4b. Total Loan Amount (History: Own + Guaranteed)
    const totalLoanAmount = db.prepare(`
      SELECT SUM(principal) as total FROM loans 
      WHERE (member_id = ? OR borrower_name = ? OR guarantor_id = ?)
    `).get(memberId, member.name, memberId).total || 0;

    // 4c. Total Guaranteed Amount (Active)
    const totalGuaranteedAmount = db.prepare(`
      SELECT SUM(principal) as total FROM loans 
      WHERE guarantor_id = ? 
      AND status = 'Active'
      AND (member_id IS NULL OR member_id != ?)
      AND (borrower_name IS NULL OR borrower_name != ?)
    `).get(memberId, memberId, member.name).total || 0;

    // 5. Annual Fee
    const annualFees = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'AnnualFee'").get(memberId).total || 0;
    
    // Check if annual fee for current year is paid
    const currentYear = new Date().getFullYear();
    const annualFeePaidThisYear = db.prepare(`
      SELECT COUNT(*) as count FROM transactions 
      WHERE member_id = ? AND type = 'AnnualFee' AND strftime('%Y', date) = ?
    `).get(memberId, currentYear.toString()).count > 0;

    // 6. Months Contributed Count
    const monthsContributed = db.prepare(`
      SELECT COUNT(DISTINCT month) as count FROM transactions 
      WHERE member_id = ? AND type = 'Contribution'
    `).get(memberId).count || 0;

    const expectedReceivable = principal + dividendShare + guarantorInterest - outstandingDebt;

    res.json({
      ...member,
      stats: {
        principal,
        dividendShare,
        guarantorInterest,
        outstandingDebt,
        currentPrincipalDebt,
        totalLoanAmount,
        totalGuaranteedAmount,
        annualFees,
        annualFeePaidThisYear,
        monthsContributed,
        expectedReceivable
      }
    });
  });

  // Member Contribution History
  app.get("/api/members/:id/contributions", (req, res) => {
    const memberId = req.params.id;
    const contributions = db.prepare(`
      SELECT * FROM transactions 
      WHERE member_id = ? AND type IN ('Contribution', 'AnnualFee')
      ORDER BY date DESC
    `).all(memberId);
    res.json(contributions);
  });

  // All Contributions History
  app.get("/api/contributions/all", (req, res) => {
    const contributions = db.prepare(`
      SELECT * FROM transactions 
      WHERE type IN ('Contribution', 'AnnualFee')
      ORDER BY date DESC
    `).all();
    res.json(contributions);
  });

  // Record Contribution
  app.post("/api/contributions", (req, res) => {
    const { member_id, amount, isFirstOfYear, period, month } = req.body;
    
    const member = db.prepare("SELECT slots FROM members WHERE id = ?").get(member_id);
    if (!member) return res.status(404).json({ error: "Member not found" });

    db.transaction(() => {
      if (isFirstOfYear) {
        const annualFeeTotal = 200 * member.slots;
        db.prepare("INSERT INTO transactions (member_id, amount, type, period, month) VALUES (?, ?, ?, ?, ?)").run(member_id, annualFeeTotal, 'AnnualFee', period, month);
        db.prepare("INSERT INTO transactions (member_id, amount, type, period, month) VALUES (?, ?, ?, ?, ?)").run(member_id, amount - annualFeeTotal, 'Contribution', period, month);
      } else {
        db.prepare("INSERT INTO transactions (member_id, amount, type, period, month) VALUES (?, ?, ?, ?, ?)").run(member_id, amount, 'Contribution', period, month);
      }
    })();
    
    res.json({ success: true });
  });

  // Create Loan
  app.post("/api/loans", (req, res) => {
    const { member_id, borrower_name, guarantor_id, amount, months } = req.body;
    
    const borrowerId = member_id ? Number(member_id) : null;
    const guarantorId = Number(guarantor_id);
    const loanAmount = Number(amount);
    const loanMonths = Number(months) || 1;
    const nonMemberName = borrower_name;

    if ((!borrowerId && !nonMemberName) || !guarantorId || !loanAmount) {
      return res.status(400).json({ error: "Borrower, Guarantor, and Amount are required." });
    }

    if (borrowerId && borrowerId === guarantorId) {
      return res.status(400).json({ error: "Borrower and Guarantor cannot be the same person." });
    }

    if (loanMonths < 1 || loanMonths > 5) {
      return res.status(400).json({ error: "Loan term must be between 1 and 5 months." });
    }

    // Eligibility Check: Loan_Amount + Current_Debt <= (Member_Contribution * 2) + Guarantor_Contribution
    let borrowerPrincipal = 0;
    let currentDebt = 0;

    if (borrowerId) {
      const borrowerRow = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'Contribution'").get(borrowerId) as any;
      borrowerPrincipal = borrowerRow?.total || 0;
      
      // Calculate current principal debt (Principal - Principal Paid)
      const activeLoans = db.prepare("SELECT id, principal FROM loans WHERE member_id = ? AND status = 'Active'").all(borrowerId);
      activeLoans.forEach((loan: any) => {
        const paid = db.prepare("SELECT SUM(principal_portion) as total FROM loan_payments WHERE loan_id = ?").get(loan.id) as any;
        currentDebt += Math.max(0, loan.principal - (paid?.total || 0));
      });
    }

    const guarantorRow = db.prepare("SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'Contribution'").get(guarantorId) as any;
    const guarantorPrincipal = guarantorRow?.total || 0;
    
    const totalEligibility = (borrowerPrincipal * 2) + guarantorPrincipal;

    if (loanAmount <= 0) {
      return res.status(400).json({ error: "Loan amount must be greater than zero." });
    }

    if ((loanAmount + currentDebt) > totalEligibility) {
      return res.status(400).json({ 
        error: `Loan exceeds eligibility cap. 
          Total limit: ₱${totalEligibility.toLocaleString()} 
          (${borrowerId ? `2x your principal: ₱${(borrowerPrincipal * 2).toLocaleString()} + ` : ''}guarantor principal: ₱${guarantorPrincipal.toLocaleString()}). 
          Current active debt: ₱${currentDebt.toLocaleString()}.
          You can borrow up to ₱${(totalEligibility - currentDebt).toLocaleString()} more.` 
      });
    }

    const result = db.prepare("INSERT INTO loans (member_id, borrower_name, guarantor_id, principal, months, due_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' month'))")
      .run(borrowerId, nonMemberName, guarantorId, loanAmount, loanMonths, loanMonths);
    
    res.json({ id: result.lastInsertRowid });
  });

  // Pay Loan
  app.post("/api/loans/:id/pay", (req, res) => {
    const loanId = req.params.id;
    const { amount } = req.body; // Total payment
    
    const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Proportional split: Total interest is 6% * months
    const totalInterestRate = 0.06 * loan.months;
    const interestPortion = amount * (totalInterestRate / (1 + totalInterestRate));
    const principalPortion = amount - interestPortion;

    db.transaction(() => {
      db.prepare("INSERT INTO loan_payments (loan_id, amount_paid, interest_portion, principal_portion) VALUES (?, ?, ?, ?)")
        .run(loanId, amount, interestPortion, principalPortion);
      
      // Check total principal paid for this loan
      const totalPrincipalPaid = db.prepare("SELECT SUM(principal_portion) as total FROM loan_payments WHERE loan_id = ?").get(loanId).total || 0;
      
      if (totalPrincipalPaid >= loan.principal) {
        db.prepare("UPDATE loans SET status = 'Paid' WHERE id = ?").run(loanId);
      }
    })();

    res.json({ success: true });
  });

  // All Loan Payments History
  app.get("/api/loan-payments/all", (req, res) => {
    const payments = db.prepare(`
      SELECT lp.*, COALESCE(m.name, l.borrower_name) as debtor_name
      FROM loan_payments lp
      JOIN loans l ON lp.loan_id = l.id
      LEFT JOIN members m ON l.member_id = m.id
      ORDER BY lp.date DESC
    `).all();
    res.json(payments);
  });

  // Pay Loan (General endpoint)
  app.post("/api/loan-payments", (req, res) => {
    const { loan_id, amount } = req.body;
    const loanId = loan_id;
    const paymentAmount = Number(amount);
    
    const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Proportional split: Total interest is 6% * months
    const totalInterestRate = 0.06 * loan.months;
    const interestPortion = paymentAmount * (totalInterestRate / (1 + totalInterestRate));
    const principalPortion = paymentAmount - interestPortion;

    db.transaction(() => {
      db.prepare("INSERT INTO loan_payments (loan_id, amount_paid, interest_portion, principal_portion) VALUES (?, ?, ?, ?)")
        .run(loanId, paymentAmount, interestPortion, principalPortion);
      
      // Check total principal paid for this loan
      const totalPrincipalPaid = db.prepare("SELECT SUM(principal_portion) as total FROM loan_payments WHERE loan_id = ?").get(loanId).total || 0;
      
      if (totalPrincipalPaid >= loan.principal) {
        db.prepare("UPDATE loans SET status = 'Paid' WHERE id = ?").run(loanId);
      }
    })();

    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // --- MAINTENANCE & PENALTIES ---

  const runMaintenance = () => {
    const today = new Date();
    const members = db.prepare("SELECT * FROM members WHERE status = 'Active'").all();
    
    members.forEach((member: any) => {
      // Check for missed periods
      // This is a simplified version for the demo
      // In a real app, you'd compare current date with 15th/30th
      // and check if a 'billing_period' record exists for this member
    });
  };

  app.post("/api/maintenance/run", (req, res) => {
    runMaintenance();
    res.json({ message: "Maintenance check completed" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
