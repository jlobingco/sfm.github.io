import React, { useState, useEffect, useRef } from 'react';
import { toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { 
  Users, 
  Wallet, 
  TrendingUp, 
  AlertCircle, 
  Plus, 
  ArrowRightLeft,
  ShieldCheck,
  History,
  Info,
  CheckCircle,
  Edit,
  Trash2,
  Copy,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Summary {
  cashOnHand: number;
  totalPortfolio: number;
  dividendPool: number;
  totalGuarantorRewards: number;
  totalPenalties: number;
  totalMembers: number;
  totalSlots: number;
}

interface Member {
  id: number;
  name: string;
  slots: number;
  status: string;
  joined_at: string;
  stats?: {
    principal: number;
    dividendShare: number;
    guarantorInterest: number;
    outstandingDebt: number;
    currentPrincipalDebt: number;
    totalLoanAmount: number;
    totalGuaranteedAmount: number;
    annualFees: number;
    annualFeePaidThisYear: boolean;
    monthsContributed: number;
    expectedReceivable: number;
  };
}

interface Loan {
  id: number;
  member_id: number;
  guarantor_id: number;
  principal: number;
  interest_rate: number;
  months: number;
  totalInterest: number;
  biMonthlyPayment: number;
  amountPaid: number;
  remainingBalance: number;
  status: string;
  created_at: string;
  due_at: string;
  debtor_name: string;
  guarantor_name: string;
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanPayments, setLoanPayments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'loans' | 'contributions'>('members');
  const [loanSubTab, setLoanSubTab] = useState<'active' | 'payments' | 'history'>('active');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [contributionHistory, setContributionHistory] = useState<any[]>([]);
  const [globalContributions, setGlobalContributions] = useState<any[]>([]);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isCustomizingDashboard, setIsCustomizingDashboard] = useState(false);
  const [dashboardVisibility, setDashboardVisibility] = useState(() => {
    const saved = localStorage.getItem('dashboardVisibility');
    return saved ? JSON.parse(saved) : {
      cashOnHand: true,
      totalPortfolio: true,
      dividendPool: true,
      guarantorRewards: true,
      totalPenalties: true,
      totalMembers: true,
      totalSlots: true,
    };
  });
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [isAddingContribution, setIsAddingContribution] = useState(false);
  const [isAddingLoanPayment, setIsAddingLoanPayment] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  // Sorting and Selection States
  const [sortField, setSortField] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());

  // Form States
  const [newMember, setNewMember] = useState({ name: '', slots: 1 });
  const [newLoan, setNewLoan] = useState({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });
  const [newLoanPayment, setNewLoanPayment] = useState({ loan_id: '', amount: 0 });
  const [newContribution, setNewContribution] = useState({ 
    member_id: '', 
    amount: 500, 
    isFirstOfYear: false, 
    period: '15th',
    month: new Date().toISOString().slice(0, 7)
  });
  const [borrowerSearch, setBorrowerSearch] = useState('');
  const [selectedMemberForContribution, setSelectedMemberForContribution] = useState<Member | null>(null);
  const [loanWarning, setLoanWarning] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const copyAsImage = async () => {
    if (!dashboardRef.current) return;
    
    try {
      const blob = await toBlob(dashboardRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Dashboard copied to clipboard as image!');
      }
    } catch (err) {
      console.error('Failed to copy image:', err);
      alert('Failed to copy image. Please try again.');
    }
  };

  useEffect(() => {
    localStorage.setItem('dashboardVisibility', JSON.stringify(dashboardVisibility));
  }, [dashboardVisibility]);

  const fetchData = async () => {
    const [summaryRes, membersRes, loansRes, globalContribRes, loanPaymentsRes] = await Promise.all([
      fetch('/api/summary'),
      fetch('/api/members'),
      fetch('/api/loans'),
      fetch('/api/contributions/all'),
      fetch('/api/loan-payments/all')
    ]);
    setSummary(await summaryRes.json());
    setMembers(await membersRes.json());
    setLoans(await loansRes.json());
    setGlobalContributions(await globalContribRes.json());
    setLoanPayments(await loanPaymentsRes.json());

    // Auto-refresh selected member details if one is selected
    if (selectedMember) {
      const [memberRes, historyRes] = await Promise.all([
        fetch(`/api/members/${selectedMember.id}`),
        fetch(`/api/members/${selectedMember.id}/contributions`)
      ]);
      setSelectedMember(await memberRes.json());
      setContributionHistory(await historyRes.json());
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMember)
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
      return;
    }

    setIsAddingMember(false);
    setNewMember({ name: '', slots: 1 });
    fetchData();
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newLoan.member_id === newLoan.guarantor_id && newLoan.member_id !== '') {
      alert("Borrower and Guarantor cannot be the same person.");
      return;
    }
    
    const payload = {
      ...newLoan,
      borrower_name: newLoan.member_id ? '' : borrowerSearch
    };

    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
    } else {
      // Generate contract before closing and resetting
      const borrower = members.find(m => m.id.toString() === newLoan.member_id);
      const guarantor = members.find(m => m.id.toString() === newLoan.guarantor_id);
      const bName = borrower ? borrower.name : borrowerSearch;
      const gName = guarantor ? guarantor.name : 'N/A';
      
      generateLoanContract(newLoan, bName, gName);

      setIsAddingLoan(false);
      setNewLoan({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });
      setBorrowerSearch('');
      setLoanWarning(null);
      fetchData();
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/contributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newContribution)
    });
    setIsAddingContribution(false);
    setSelectedMemberForContribution(null);
    fetchData();
  };

  const handleAddLoanPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/loan-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLoanPayment)
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
    } else {
      setIsAddingLoanPayment(false);
      setNewLoanPayment({ loan_id: '', amount: 0 });
      fetchData();
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    const res = await fetch(`/api/members/${editingMember.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingMember.name,
        slots: editingMember.slots,
        status: editingMember.status
      })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
      return;
    }

    setIsEditingMember(false);
    setEditingMember(null);
    fetchData();
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;

    const res = await fetch(`/api/members/${memberToDelete.id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(err.error);
      return;
    }

    if (selectedMember?.id === memberToDelete.id) {
      setSelectedMember(null);
    }
    setIsDeletingMember(false);
    setMemberToDelete(null);
    fetchData();
  };

  const sortedContributions = [...globalContributions].sort((a, b) => {
    let aVal: any = a[sortField as keyof typeof a];
    let bVal: any = b[sortField as keyof typeof b];

    if (sortField === 'member') {
      aVal = members.find(m => m.id === a.member_id)?.name || '';
      bVal = members.find(m => m.id === b.member_id)?.name || '';
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleTxSelection = (id: number) => {
    const newSelection = new Set(selectedTxIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedTxIds(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedTxIds.size === globalContributions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(globalContributions.map(tx => tx.id)));
    }
  };

  const selectedTotal = globalContributions
    .filter(tx => selectedTxIds.has(tx.id))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const fetchMemberForContribution = async (id: string) => {
    if (!id) {
      setSelectedMemberForContribution(null);
      return;
    }
    const [memberRes, historyRes] = await Promise.all([
      fetch(`/api/members/${id}`),
      fetch(`/api/members/${id}/contributions`)
    ]);
    const memberData = await memberRes.json();
    const historyData = await historyRes.json();
    
    setSelectedMemberForContribution(memberData);
    setContributionHistory(historyData); // Use this to check disabled months
    setNewContribution(prev => {
      let period = prev.period;
      const isPeriodPaid = historyData.some((tx: any) => tx.type === 'Contribution' && tx.month === prev.month && tx.period === period);
      if (isPeriodPaid) {
        period = period === '15th' ? '30th' : '15th';
      }
      return {
        ...prev,
        member_id: id,
        period,
        amount: (memberData.slots || 1) * 500,
        isFirstOfYear: !memberData.stats?.annualFeePaidThisYear
      };
    });
  };

  const checkLoanEligibility = (memberId: string, guarantorId: string, amount: number) => {
    const borrowerPromise = memberId 
      ? fetch(`/api/members/${memberId}`).then(res => res.json())
      : Promise.resolve({ stats: { principal: 0, outstandingDebt: 0 } });
    
    const guarantorPromise = guarantorId 
      ? fetch(`/api/members/${guarantorId}`).then(res => res.json())
      : Promise.resolve({ stats: { principal: 0 } });

    Promise.all([borrowerPromise, guarantorPromise]).then(([borrowerData, guarantorData]) => {
      const borrowerPrincipal = borrowerData.stats?.principal || 0;
      const guarantorPrincipal = guarantorData.stats?.principal || 0;
      const currentDebt = borrowerData.stats?.currentPrincipalDebt || 0;
      
      const totalEligibility = (borrowerPrincipal * 2) + guarantorPrincipal;
      
      if ((amount + currentDebt) > totalEligibility) {
        setLoanWarning(`Warning: Loan amount (${formatCurrency(amount)}) exceeds eligibility cap. ${memberId ? 'Your' : 'The'} limit is ${formatCurrency(totalEligibility)} (${memberId ? '2x your principal + ' : ''}guarantor principal).`);
      } else {
        setLoanWarning(null);
      }
    });
  };

  const viewMemberDetails = async (id: number) => {
    const [memberRes, historyRes] = await Promise.all([
      fetch(`/api/members/${id}`),
      fetch(`/api/members/${id}/contributions`)
    ]);
    setSelectedMember(await memberRes.json());
    setContributionHistory(await historyRes.json());
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

  const generateLoanContract = (loanData: any, borrowerName: string, guarantorName: string) => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const formatPHP = (val: number) => `PHP ${formatCurrency(val)}`;
    
    // --- Header / Logo Section ---
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.roundedRect(20, 15, 15, 15, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SF', 27.5, 25, { align: 'center' });
    
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(18);
    doc.text('SAVERS FUND', 40, 26);
    
    doc.setDrawColor(229, 231, 235);
    doc.line(20, 35, 190, 35);
    
    // --- Title ---
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('LOAN AGREEMENT', 105, 50, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Document Date: ${date}`, 190, 58, { align: 'right' });
    
    // --- Section 1: Parties ---
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(20, 65, 45, 65);
    
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. PARTIES TO THE AGREEMENT', 20, 75);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('This agreement is entered into between the following parties:', 20, 83);
    
    // Parties Boxes (3 columns)
    const boxW = 54;
    const boxH = 20;
    const boxY = 88;
    
    // Borrower Box
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(20, boxY, boxW, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('BORROWER', 25, boxY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(borrowerName, 25, boxY + 14);
    
    // Guarantor Box
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(78, boxY, boxW, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('GUARANTOR', 83, boxY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(guarantorName, 83, boxY + 14);

    // Administrator Box
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(136, boxY, boxW, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ADMINISTRATOR', 141, boxY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Savers Fund Admin', 141, boxY + 14);
    
    // --- Section 2: Loan Details ---
    doc.setDrawColor(37, 99, 235);
    doc.line(20, 118, 45, 118);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('2. FINANCIAL TERMS', 20, 128);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('The following financial terms apply to this loan application:', 20, 136);
    
    const startY = 145;
    const rowHeight = 8;
    const details = [
      { label: 'Principal Amount:', value: formatPHP(loanData.amount), highlight: true },
      { label: 'Interest Rate:', value: '6.00% (Fixed)', highlight: false },
      { label: 'Total Repayment Amount:', value: formatPHP(loanData.amount * 1.06), highlight: true },
      { label: 'Loan Term:', value: `${loanData.months} Month(s)`, highlight: false },
      { label: 'Payment Frequency:', value: `Bi-monthly (${loanData.months * 2} installments)`, highlight: false },
      { label: 'Bi-monthly Installment:', value: formatPHP((loanData.amount * 1.06) / (loanData.months * 2)), highlight: true },
    ];
    
    details.forEach((item, i) => {
      const y = startY + (i * rowHeight);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(75, 85, 99);
      doc.text(item.label, 30, y);
      
      if (item.highlight) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
      }
      doc.text(item.value, 100, y);
    });
    
    // --- Section 3: Terms ---
    doc.setDrawColor(37, 99, 235);
    doc.line(20, 200, 45, 200);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(17, 24, 39);
    doc.text('3. TERMS AND CONDITIONS', 20, 210);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    const terms = [
      'a. The Borrower agrees to pay the bi-monthly installments on or before the 15th and 30th of each month.',
      'b. A late payment penalty of PHP 50.00 will be applied for every missed payment period.',
      'c. The Guarantor shall be held fully liable for the outstanding balance if the Borrower defaults on payments.',
      'd. This loan is subject to the governing rules and regulations of the Savers Fund organization.'
    ];
    
    terms.forEach((term, i) => {
      const splitText = doc.splitTextToSize(term, 160);
      doc.text(splitText, 25, 220 + (i * 10));
    });
    
    // --- Signatures ---
    const sigY = 265;
    const sigLineW = 50;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.2);
    
    // Borrower
    doc.line(20, sigY, 20 + sigLineW, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('BORROWER SIGNATURE', 20 + sigLineW/2, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(borrowerName, 20 + sigLineW/2, sigY + 10, { align: 'center' });
    
    // Guarantor
    doc.line(80, sigY, 80 + sigLineW, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text('GUARANTOR SIGNATURE', 80 + sigLineW/2, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(guarantorName, 80 + sigLineW/2, sigY + 10, { align: 'center' });

    // Administrator
    doc.line(140, sigY, 140 + sigLineW, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text('ADMINISTRATOR SIGNATURE', 140 + sigLineW/2, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Savers Fund Administrator', 140 + sigLineW/2, sigY + 10, { align: 'center' });
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('This is a computer-generated document. No physical stamp is required.', 105, 285, { align: 'center' });
    
    doc.save(`Loan_Contract_${borrowerName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  const generateMonths = () => {
    const months = [];
    const currentYear = new Date().getFullYear();
    
    // Dec last year
    months.push(`${currentYear - 1}-12`);
    
    // Jan to Dec this year
    for (let m = 1; m <= 12; m++) {
      months.push(`${currentYear}-${m.toString().padStart(2, '0')}`);
    }
    return months;
  };

  const monthOptions = generateMonths();
  const contributedMonths = new Set(
    monthOptions.filter(m => {
      const contributionsForMonth = contributionHistory.filter(tx => tx.type === 'Contribution' && tx.month === m);
      const has15th = contributionsForMonth.some(tx => tx.period === '15th');
      const has30th = contributionsForMonth.some(tx => tx.period === '30th');
      return has15th && has30th;
    })
  );

  const isPeriodDisabled = (month: string, period: string) => {
    return contributionHistory.some(tx => tx.type === 'Contribution' && tx.month === month && tx.period === period);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-[#1E293B] border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Wallet className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Savers Fund</h1>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={async () => {
                await fetch('/api/maintenance/run', { method: 'POST' });
                alert('Maintenance check completed. Penalties applied where applicable.');
                fetchData();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 text-amber-400 rounded-lg font-medium hover:bg-amber-900/30 transition-colors"
            >
              <AlertCircle className="w-4 h-4" /> Run Maintenance
            </button>
            <button 
              onClick={() => setIsCustomizingDashboard(true)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
              title="Customize Dashboard"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsAddingContribution(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-900/20 text-emerald-400 rounded-lg font-medium hover:bg-emerald-900/30 transition-colors"
            >
              <Plus className="w-4 h-4" /> Contribution
            </button>
            <button 
              onClick={() => {
                setNewLoan({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });
                setBorrowerSearch('');
                setLoanWarning(null);
                setIsAddingLoan(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-900/20 text-blue-400 rounded-lg font-medium hover:bg-blue-900/30 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" /> New Loan
            </button>
            <button 
              onClick={() => setIsAddingLoanPayment(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-900/20 text-indigo-400 rounded-lg font-medium hover:bg-indigo-900/30 transition-colors"
            >
              <CheckCircle className="w-4 h-4" /> Loan Payment
            </button>
            <button 
              onClick={() => setIsAddingMember(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <Users className="w-4 h-4" /> Add Member
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {dashboardVisibility.cashOnHand && (
            <SummaryCard 
              title="Cash on Hand" 
              value={summary?.cashOnHand || 0} 
              icon={<Wallet className="w-5 h-5" />} 
              color="emerald"
              tooltip="Total liquid funds available (Contributions + Payments + Penalties - Active Loans - Refunds)."
            />
          )}
          {dashboardVisibility.totalPortfolio && (
            <SummaryCard 
              title="Total Portfolio" 
              value={summary?.totalPortfolio || 0} 
              icon={<TrendingUp className="w-5 h-5" />} 
              color="blue"
              tooltip="The total principal amount of all currently active loans."
            />
          )}
          {dashboardVisibility.dividendPool && (
            <SummaryCard 
              title="Dividend Pool (4%)" 
              value={summary?.dividendPool || 0} 
              icon={<ShieldCheck className="w-5 h-5" />} 
              color="indigo"
              tooltip="Portion of interest earned (4% of the 6% total) to be distributed among members based on slots."
            />
          )}
          {dashboardVisibility.guarantorRewards && (
            <SummaryCard 
              title="Guarantor Rewards (2%)" 
              value={summary?.totalGuarantorRewards || 0} 
              icon={<CheckCircle className="w-5 h-5" />} 
              color="emerald"
              tooltip="Total interest earned by guarantors (2% of the 6% total) for backing loans."
            />
          )}
          {dashboardVisibility.totalPenalties && (
            <SummaryCard 
              title="Total Penalties" 
              value={summary?.totalPenalties || 0} 
              icon={<AlertCircle className="w-5 h-5" />} 
              color="amber"
              tooltip="Total amount collected from missed payments or late contributions."
            />
          )}
          {dashboardVisibility.totalMembers && (
            <SummaryCard 
              title="Active Members" 
              value={summary?.totalMembers || 0} 
              icon={<Users className="w-5 h-5" />} 
              color="blue"
              format="number"
              tooltip="Total number of active members in the fund."
            />
          )}
          {dashboardVisibility.totalSlots && (
            <SummaryCard 
              title="Total Slots" 
              value={summary?.totalSlots || 0} 
              icon={<Plus className="w-5 h-5" />} 
              color="emerald"
              format="number"
              tooltip="Total number of contribution slots across all members."
            />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tab Switcher */}
            <div className="flex gap-6 border-b border-slate-700">
              <button 
                onClick={() => setActiveTab('members')}
                className={`pb-4 text-sm font-bold transition-all relative ${
                  activeTab === 'members' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Members Directory
                {activeTab === 'members' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
              </button>
              <button 
                onClick={() => setActiveTab('loans')}
                className={`pb-4 text-sm font-bold transition-all relative ${
                  activeTab === 'loans' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Loan Transactions
                {activeTab === 'loans' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
              </button>
              <button 
                onClick={() => setActiveTab('contributions')}
                className={`pb-4 text-sm font-bold transition-all relative ${
                  activeTab === 'contributions' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Contribution History
                {activeTab === 'contributions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
              </button>
            </div>

            <div className="bg-[#1E293B] rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
              {activeTab === 'members' ? (
                <>
                  <div className="px-6 py-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center gap-4">
                    <h2 className="font-bold text-lg text-white">Members Directory</h2>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>{members.length} Active Members</span>
                      <span>{members.reduce((sum, m) => sum + (m.slots || 0), 0)} Total Slots</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        <tr>
                          <th className="px-6 py-3">Member Name</th>
                          <th className="px-6 py-3">Slots</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {members.map((member) => (
                          <tr key={member.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-200">{member.name}</td>
                            <td className="px-6 py-4">
                              <span className="bg-slate-700 px-2 py-1 rounded text-xs font-bold text-slate-300">
                                {member.slots} Slots
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                member.status === 'Active' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
                              }`}>
                                {member.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => viewMemberDetails(member.id)}
                                  className="text-blue-400 hover:text-blue-300 font-semibold text-sm"
                                >
                                  View
                                </button>
                                <button 
                                  onClick={() => {
                                    setEditingMember(member);
                                    setIsEditingMember(true);
                                  }}
                                  className="text-slate-400 hover:text-slate-200 p-1"
                                  title="Edit Member"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => {
                                    setMemberToDelete(member);
                                    setIsDeletingMember(true);
                                  }}
                                  className="text-red-400 hover:text-red-300 p-1"
                                  title="Delete Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : activeTab === 'loans' ? (
                <>
                  <div className="px-6 py-4 border-b border-slate-700/50 flex justify-between items-center">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setLoanSubTab('active')}
                        className={`font-bold text-lg ${loanSubTab === 'active' ? 'text-white' : 'text-slate-500'}`}
                      >
                        Active Loans
                      </button>
                      <button 
                        onClick={() => setLoanSubTab('payments')}
                        className={`font-bold text-lg ${loanSubTab === 'payments' ? 'text-white' : 'text-slate-500'}`}
                      >
                        Payment History
                      </button>
                      <button 
                        onClick={() => setLoanSubTab('history')}
                        className={`font-bold text-lg ${loanSubTab === 'history' ? 'text-white' : 'text-slate-500'}`}
                      >
                        Loan History
                      </button>
                    </div>
                    <span className="text-sm text-slate-400">
                      {loanSubTab === 'active' && `${loans.filter(l => l.status === 'Active').length} Active`}
                      {loanSubTab === 'payments' && `${loanPayments.length} Payments`}
                      {loanSubTab === 'history' && `${loans.length} Total Loans`}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    {loanSubTab === 'active' && (
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                          <tr>
                            <th className="px-6 py-3">Debtor</th>
                            <th className="px-6 py-3">Guarantor</th>
                            <th className="px-6 py-3 text-right">Principal</th>
                            <th className="px-6 py-3 text-right">Total Interest</th>
                            <th className="px-6 py-3 text-right">Total Payable</th>
                            <th className="px-6 py-3 text-right">Paid</th>
                            <th className="px-6 py-3 text-right">Remaining</th>
                            <th className="px-6 py-3">Term</th>
                            <th className="px-6 py-3 text-right">Bi-monthly</th>
                            <th className="px-6 py-3">Loaned Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {loans.filter(l => l.status === 'Active').map((loan) => (
                            <tr key={loan.id} className="hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-200">{loan.debtor_name}</td>
                              <td className="px-6 py-4 text-slate-400">{loan.guarantor_name}</td>
                              <td className="px-6 py-4 font-bold text-right text-slate-200">{formatCurrency(loan.principal)}</td>
                              <td className="px-6 py-4 text-emerald-400 font-semibold text-right">{formatCurrency(loan.totalInterest)}</td>
                              <td className="px-6 py-4 font-bold text-indigo-400 text-right">{formatCurrency(loan.principal + loan.totalInterest)}</td>
                              <td className="px-6 py-4 text-emerald-400 font-bold text-right">{formatCurrency(loan.amountPaid)}</td>
                              <td className="px-6 py-4 text-red-400 font-bold text-right">{formatCurrency(loan.remainingBalance)}</td>
                              <td className="px-6 py-4 text-xs text-slate-400">{loan.months} Mo</td>
                              <td className="px-6 py-4 font-bold text-blue-400 text-right">{formatCurrency(loan.biMonthlyPayment)}</td>
                              <td className="px-6 py-4 text-slate-500 text-xs">
                                {new Date(loan.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {loanSubTab === 'payments' && (
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                          <tr>
                            <th className="px-6 py-3">Debtor</th>
                            <th className="px-6 py-3">Amount Paid</th>
                            <th className="px-6 py-3">Principal Portion</th>
                            <th className="px-6 py-3">Interest Portion</th>
                            <th className="px-6 py-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {loanPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-200">{p.debtor_name}</td>
                              <td className="px-6 py-4 font-bold text-slate-200">{formatCurrency(p.amount_paid)}</td>
                              <td className="px-6 py-4 text-slate-400">{formatCurrency(p.principal_portion)}</td>
                              <td className="px-6 py-4 text-emerald-400">{formatCurrency(p.interest_portion)}</td>
                              <td className="px-6 py-4 text-slate-500 text-xs">
                                {new Date(p.date).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {loanSubTab === 'history' && (
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                          <tr>
                            <th className="px-6 py-3">Debtor</th>
                            <th className="px-6 py-3">Guarantor</th>
                            <th className="px-6 py-3 text-right">Principal</th>
                            <th className="px-6 py-3 text-right">Total Interest</th>
                            <th className="px-6 py-3">Term</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Due Date</th>
                            <th className="px-6 py-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {loans.map((loan) => (
                            <tr key={loan.id} className="hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-200">{loan.debtor_name}</td>
                              <td className="px-6 py-4 text-slate-400">{loan.guarantor_name}</td>
                              <td className="px-6 py-4 font-bold text-right text-slate-200">{formatCurrency(loan.principal)}</td>
                              <td className="px-6 py-4 text-emerald-400 text-right">{formatCurrency(loan.totalInterest)}</td>
                              <td className="px-6 py-4 text-xs text-slate-400">{loan.months} Mo</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase w-fit ${
                                    loan.status === 'Active' ? 'bg-blue-900/30 text-blue-400' : 'bg-slate-700 text-slate-300'
                                  }`}>
                                    {loan.status}
                                  </span>
                                  {loan.status === 'Active' && new Date(loan.due_at) < new Date() && (
                                    <span className="bg-red-900/30 text-red-400 px-2 py-1 rounded text-[10px] font-bold uppercase w-fit animate-pulse">
                                      Overdue
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-slate-400 text-xs">
                                {new Date(loan.due_at).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 text-slate-500 text-xs">
                                {new Date(loan.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <h2 className="font-bold text-lg text-slate-100">Global Contribution History</h2>
                      {selectedTxIds.size > 0 && (
                        <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                          Selected Total: {formatCurrency(selectedTotal)}
                          <span className="text-[10px] bg-emerald-500/20 px-1.5 rounded text-emerald-300">{selectedTxIds.size} items</span>
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-slate-400">{globalContributions.length} Transactions</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        <tr>
                          <th className="px-6 py-3 w-10">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                              checked={selectedTxIds.size === globalContributions.length && globalContributions.length > 0}
                              onChange={toggleAllSelection}
                            />
                          </th>
                          <th className="px-6 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort('member')}>
                            Member {sortField === 'member' && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort('type')}>
                            Type {sortField === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-3 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => toggleSort('period')}>
                            Period {sortField === 'period' && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-3 cursor-pointer hover:bg-slate-800 transition-colors text-right" onClick={() => toggleSort('amount')}>
                            Amount {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-6 py-3 cursor-pointer hover:bg-slate-800 transition-colors text-right" onClick={() => toggleSort('date')}>
                            Date {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {sortedContributions.map((tx) => (
                          <tr key={tx.id} className={`hover:bg-slate-800/50 transition-colors ${selectedTxIds.has(tx.id) ? 'bg-emerald-500/5' : ''}`}>
                            <td className="px-6 py-4">
                              <input 
                                type="checkbox" 
                                className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                                checked={selectedTxIds.has(tx.id)}
                                onChange={() => toggleTxSelection(tx.id)}
                              />
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-200">
                              {members.find(m => m.id === tx.member_id)?.name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                tx.type === 'Contribution' ? 'bg-emerald-900/20 text-emerald-400' : 'bg-blue-900/20 text-blue-400'
                              }`}>
                                {tx.type}
                              </span>
                              {tx.month && <span className="ml-2 text-[10px] text-slate-500">({tx.month})</span>}
                            </td>
                            <td className="px-6 py-4 text-slate-400 text-xs">{tx.period}</td>
                            <td className="px-6 py-4 font-bold text-right text-slate-100">{formatCurrency(tx.amount)}</td>
                            <td className="px-6 py-4 text-slate-500 text-xs text-right">
                              {new Date(tx.date).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Member Dashboard / Expected Receivable */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-sm p-6 sticky top-24 h-fit">
            <AnimatePresence mode="wait">
              {selectedMember ? (
                <motion.div
                  key={selectedMember.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {(() => {
                    const paidMonths = contributionHistory
                      .filter(tx => tx.type === 'Contribution')
                      .map(tx => `${tx.month} (${tx.period})`);
                    const tooltipText = paidMonths.length > 0 
                      ? `Paid: ${paidMonths.join(', ')}`
                      : 'No contributions yet';
                    
                    return (
                      <div ref={dashboardRef} className="bg-slate-800 p-1">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-2xl font-bold text-slate-100">{selectedMember.name}</h3>
                            <p className="text-sm text-slate-400">Member ID: #{selectedMember.id}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={copyAsImage} 
                              className="text-slate-400 hover:text-emerald-400 transition-colors p-1 rounded-md hover:bg-emerald-500/10"
                              title="Copy as Image"
                            >
                              <Copy className="w-5 h-5" />
                            </button>
                            <button onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-700">
                              <Plus className="w-5 h-5 rotate-45" />
                            </button>
                          </div>
                        </div>

                        <div className="bg-emerald-600 rounded-xl p-6 text-white mb-6 shadow-lg shadow-emerald-900/20 relative group/receivable">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest text-emerald-100/80">Expected Receivable</p>
                            <div className="relative group/tooltip">
                              <Info className="w-3.5 h-3.5 text-emerald-200 cursor-help hover:text-white transition-colors" />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-20 pointer-events-none font-normal normal-case tracking-normal border border-slate-700">
                                This is the estimated amount you will receive after all loans are paid and dividends are distributed.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                              </div>
                            </div>
                          </div>
                          <h4 className="text-3xl font-bold">{formatCurrency(selectedMember.stats?.expectedReceivable || 0)}</h4>
                        </div>

                        <div className="space-y-4">
                          <DetailRow label="Total Principal" value={selectedMember.stats?.principal || 0} icon={<History className="w-4 h-4" />} />
                          <DetailRow 
                            label="Months Contributed" 
                            value={selectedMember.stats?.monthsContributed || 0} 
                            icon={<CheckCircle className="w-4 h-4" />} 
                            color="text-emerald-400" 
                            format="number" 
                            tooltip={tooltipText}
                          />
                          <DetailRow label="Total Loans (History)" value={selectedMember.stats?.totalLoanAmount || 0} icon={<ArrowRightLeft className="w-4 h-4" />} />
                    <DetailRow label="Guaranteed (Active)" value={selectedMember.stats?.totalGuaranteedAmount || 0} icon={<ShieldCheck className="w-4 h-4" />} color="text-indigo-400" />
                    <DetailRow label="Dividend Share (4%)" value={selectedMember.stats?.dividendShare || 0} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-400" />
                    <DetailRow label="Guarantor Rewards (2%)" value={selectedMember.stats?.guarantorInterest || 0} icon={<ShieldCheck className="w-4 h-4" />} color="text-blue-400" />
                    <div className="border-t border-slate-700 pt-4 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-slate-400">Outstanding Loans</span>
                          <div className="relative group/loan-info">
                            <Info className="w-3.5 h-3.5 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 invisible group-hover/loan-info:opacity-100 group-hover/loan-info:visible transition-all z-20 pointer-events-none font-normal normal-case tracking-normal border border-slate-700">
                              Includes your own active loans and the total payable amount of loans you have guaranteed for others.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                            </div>
                          </div>
                        </div>
                        <span className="font-bold text-rose-400">{formatCurrency(-(selectedMember.stats?.outstandingDebt || 0))}</span>
                      </div>
                      <DetailRow label="Annual Fees" value={-(selectedMember.stats?.annualFees || 0)} color="text-rose-400" />
                    </div>
                  </div>

                  <div className="mt-8 p-4 bg-slate-900/50 rounded-xl border border-slate-700 flex gap-3">
                    <Info className="w-5 h-5 text-slate-500 shrink-0" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      This calculation includes your proportional share of the group's 4% dividend pool and 2% interest from loans you've guaranteed.
                    </p>
                  </div>

                  <div className="mt-8">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Recent Contributions</h4>
                      {contributionHistory.length > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Recent Total</p>
                          <p className="text-sm font-bold text-emerald-400">
                            {formatCurrency(contributionHistory.slice(0, 5).reduce((sum, tx) => sum + tx.amount, 0))}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {contributionHistory.slice(0, 5).map(tx => (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{tx.type}</p>
                            <p className="text-[10px] text-slate-500">{new Date(tx.date).toLocaleDateString()} • {tx.period}</p>
                          </div>
                          <p className="font-bold text-sm text-slate-100">{formatCurrency(tx.amount)}</p>
                        </div>
                      ))}
                      {contributionHistory.length === 0 && (
                        <p className="text-xs text-slate-500 italic text-center py-4">No contributions recorded yet.</p>
                      )}
                    </div>
                  </div>
                </div>
                    );
                  })()}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="bg-slate-900/50 p-4 rounded-full mb-4">
                    <Users className="w-8 h-8 text-slate-600" />
                  </div>
                  <h3 className="font-bold text-slate-200">No Member Selected</h3>
                  <p className="text-sm text-slate-400 max-w-[200px] mt-2">Select a member from the directory to view their financial dashboard.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Modals */}
      <Modal isOpen={isCustomizingDashboard} onClose={() => setIsCustomizingDashboard(false)} title="Customize Dashboard">
        <div className="space-y-4">
          <p className="text-sm text-slate-400 mb-4">Toggle which metrics you want to see on your dashboard.</p>
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'cashOnHand', label: 'Cash on Hand' },
              { id: 'totalPortfolio', label: 'Total Portfolio' },
              { id: 'dividendPool', label: 'Dividend Pool (4%)' },
              { id: 'guarantorRewards', label: 'Guarantor Rewards (2%)' },
              { id: 'totalPenalties', label: 'Total Penalties' },
              { id: 'totalMembers', label: 'Active Members' },
              { id: 'totalSlots', label: 'Total Slots' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setDashboardVisibility((prev: any) => ({ ...prev, [item.id]: !prev[item.id] }))}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  dashboardVisibility[item.id as keyof typeof dashboardVisibility]
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-900/50 border-slate-700 text-slate-500'
                }`}
              >
                <span className="font-medium">{item.label}</span>
                {dashboardVisibility[item.id as keyof typeof dashboardVisibility] ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsCustomizingDashboard(false)}
            className="w-full mt-4 py-3 bg-slate-100 text-slate-900 rounded-lg font-bold hover:bg-white transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>

      <Modal isOpen={isAddingMember} onClose={() => setIsAddingMember(false)} title="Add New Member">
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Full Name</label>
            <input 
              type="text" 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={newMember.name}
              onChange={e => setNewMember({...newMember, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Slots (Max 4)</label>
            <select 
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={newMember.slots}
              onChange={e => setNewMember({...newMember, slots: parseInt(e.target.value)})}
            >
              {[1,2,3,4].map(n => <option key={n} value={n}>{n} Slots</option>)}
            </select>
          </div>
          <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors">
            Register Member
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isAddingLoan} 
        onClose={() => { 
          setIsAddingLoan(false); 
          setBorrowerSearch(''); 
          setLoanWarning(null);
          setNewLoan({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });
        }} 
        title="Create New Loan"
      >
        <form onSubmit={handleAddLoan} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Guarantor</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newLoan.guarantor_id}
              onChange={e => {
                if (e.target.value === newLoan.member_id) {
                  alert("Guarantor cannot be the same as the Borrower.");
                  return;
                }
                setNewLoan({...newLoan, guarantor_id: e.target.value});
                checkLoanEligibility(newLoan.member_id, e.target.value, newLoan.amount);
              }}
            >
              <option value="">Select Guarantor</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Borrower Name (Search)</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Type name..."
                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${newLoan.member_id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 bg-slate-900 text-slate-100'}`}
                value={borrowerSearch}
                onChange={e => {
                  const val = e.target.value;
                  setBorrowerSearch(val);
                  if (newLoan.member_id) {
                    setNewLoan(prev => ({ ...prev, member_id: '' }));
                    setLoanWarning(null);
                  }
                  checkLoanEligibility('', newLoan.guarantor_id, newLoan.amount);
                }}
              />
              {borrowerSearch && !newLoan.member_id && (
                <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {members.filter(m => m.name.toLowerCase().includes(borrowerSearch.toLowerCase())).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-slate-700 text-sm text-slate-200"
                      onClick={() => {
                        if (m.id.toString() === newLoan.guarantor_id) {
                          alert("Borrower cannot be the same as the Guarantor.");
                          return;
                        }
                        setNewLoan({...newLoan, member_id: m.id.toString()});
                        setBorrowerSearch(m.name);
                        checkLoanEligibility(m.id.toString(), newLoan.guarantor_id, newLoan.amount);
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                  {members.filter(m => m.name.toLowerCase().includes(borrowerSearch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-2 text-slate-500 text-sm italic">No members found</div>
                  )}
                </div>
              )}
              {newLoan.member_id && (
                <div className="absolute right-3 top-2.5 text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Loan Amount (₱)</label>
            <input 
              type="number" 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newLoan.amount}
              onChange={e => {
                const amt = parseFloat(e.target.value) || 0;
                setNewLoan({...newLoan, amount: amt});
                checkLoanEligibility(newLoan.member_id, newLoan.guarantor_id, amt);
              }}
            />
            {loanWarning && (
              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loanWarning}</span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1 italic">Max eligibility: 2x total contribution principal.</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Term (Months - Max 5)</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              value={newLoan.months}
              onChange={e => setNewLoan({...newLoan, months: parseInt(e.target.value)})}
            >
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Month{n > 1 ? 's' : ''}</option>)}
            </select>
            <p className="text-[10px] text-slate-500 mt-1 italic">Twice a month payable (bi-monthly).</p>
          </div>
          {newLoan.amount > 0 && (
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/30">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-blue-400 uppercase">Bi-monthly Payment</span>
                <span className="text-lg font-bold text-blue-300">
                  {formatCurrency((newLoan.amount * 1.06) / (newLoan.months * 2))}
                </span>
              </div>
              <p className="text-[10px] text-blue-400/70 italic">Total of {newLoan.months * 2} payments over {newLoan.months} months.</p>
            </div>
          )}
          <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
            Approve Loan
          </button>
        </form>
      </Modal>

      <Modal isOpen={isAddingContribution} onClose={() => { setIsAddingContribution(false); setSelectedMemberForContribution(null); }} title="Record Contribution">
        <form onSubmit={handleAddContribution} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Member</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newContribution.member_id}
              onChange={e => fetchMemberForContribution(e.target.value)}
            >
              <option value="">Select Member</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Month</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newContribution.month}
              onChange={e => {
                const month = e.target.value;
                let period = newContribution.period;
                if (isPeriodDisabled(month, period)) {
                  period = period === '15th' ? '30th' : '15th';
                }
                setNewContribution({...newContribution, month, period});
              }}
            >
              <option value="">Select Month</option>
              {monthOptions.map(m => {
                const [year, month] = m.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1);
                const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                const isDisabled = contributedMonths.has(m);
                return (
                  <option key={m} value={m} disabled={isDisabled}>
                    {label} {isDisabled ? '(Already Contributed)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Period</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newContribution.period}
              onChange={e => setNewContribution({...newContribution, period: e.target.value})}
            >
              <option value="15th" disabled={isPeriodDisabled(newContribution.month, '15th')}>
                15th of the Month {isPeriodDisabled(newContribution.month, '15th') ? '(Paid)' : ''}
              </option>
              <option value="30th" disabled={isPeriodDisabled(newContribution.month, '30th')}>
                30th of the Month {isPeriodDisabled(newContribution.month, '30th') ? '(Paid)' : ''}
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Amount (₱)</label>
            <input 
              type="number" 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newContribution.amount}
              onChange={e => setNewContribution({...newContribution, amount: parseFloat(e.target.value)})}
            />
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="firstOfYear"
              disabled={selectedMemberForContribution?.stats?.annualFeePaidThisYear}
              checked={newContribution.isFirstOfYear}
              onChange={e => setNewContribution({...newContribution, isFirstOfYear: e.target.checked})}
              className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="firstOfYear" className={`text-sm ${selectedMemberForContribution?.stats?.annualFeePaidThisYear ? 'text-slate-500' : 'text-slate-400'}`}>
              Deduct Annual Fee (₱200 x {selectedMemberForContribution?.slots || 1} slots = ₱{(selectedMemberForContribution?.slots || 1) * 200})
              {selectedMemberForContribution?.stats?.annualFeePaidThisYear && " - Already Paid"}
            </label>
          </div>
          <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors">
            Record Payment
          </button>
        </form>
      </Modal>

      <Modal isOpen={isAddingLoanPayment} onClose={() => setIsAddingLoanPayment(false)} title="Record Loan Payment">
        <form onSubmit={handleAddLoanPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Select Active Loan</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newLoanPayment.loan_id}
              onChange={e => {
                const loanId = e.target.value;
                const loan = loans.find(l => l.id.toString() === loanId);
                setNewLoanPayment({
                  ...newLoanPayment,
                  loan_id: loanId,
                  amount: loan ? loan.biMonthlyPayment : 0
                });
              }}
            >
              <option value="">Select Loan</option>
              {loans.filter(l => l.status === 'Active').map(l => (
                <option key={l.id} value={l.id}>
                  {l.debtor_name} - {formatCurrency(l.principal)} (Due: {new Date(l.due_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          {newLoanPayment.loan_id && (
            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-400 uppercase">Remaining Balance</span>
                <span className="text-lg font-bold text-emerald-300">
                  {(() => {
                    const loan = loans.find(l => l.id.toString() === newLoanPayment.loan_id);
                    if (!loan) return '₱0.00';
                    const totalToPay = loan.principal * 1.06;
                    return formatCurrency(totalToPay - loan.amountPaid);
                  })()}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Payment Amount (₱)</label>
            <input 
              type="number" 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
              value={newLoanPayment.amount}
              onChange={e => setNewLoanPayment({...newLoanPayment, amount: parseFloat(e.target.value)})}
            />
          </div>
          <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors">
            Record Payment
          </button>
        </form>
      </Modal>

      <Modal isOpen={isEditingMember} onClose={() => { setIsEditingMember(false); setEditingMember(null); }} title="Edit Member">
        {editingMember && (
          <form onSubmit={handleEditMember} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Full Name</label>
              <input 
                type="text" 
                required
                className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={editingMember.name}
                onChange={e => setEditingMember({...editingMember, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Slots (Max 4)</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={editingMember.slots}
                onChange={e => setEditingMember({...editingMember, slots: parseInt(e.target.value)})}
              >
                {[1,2,3,4].map(n => <option key={n} value={n}>{n} Slots</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Status</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={editingMember.status}
                onChange={e => setEditingMember({...editingMember, status: e.target.value})}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors">
              Update Member
            </button>
          </form>
        )}
      </Modal>

      <Modal isOpen={isDeletingMember} onClose={() => { setIsDeletingMember(false); setMemberToDelete(null); }} title="Delete Member">
        <div className="space-y-4">
          <div className="bg-rose-500/10 p-4 rounded-lg flex items-start gap-3 border border-rose-500/20">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-200">Warning: Irreversible Action</p>
              <p className="text-xs text-rose-400/80 mt-1">
                Are you sure you want to delete <span className="font-bold text-rose-300">{memberToDelete?.name}</span>? 
                This will permanently remove all their contributions, loans, and transaction history.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => { setIsDeletingMember(false); setMemberToDelete(null); }}
              className="flex-1 py-3 bg-slate-700 text-slate-200 rounded-lg font-bold hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleDeleteMember}
              className="flex-1 py-3 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({ title, value, icon, color, tooltip, format = "currency" }: { title: string, value: number, icon: React.ReactNode, color: string, tooltip?: string, format?: 'currency' | 'number' }) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-900/30 text-emerald-400',
    blue: 'bg-blue-900/30 text-blue-400',
    indigo: 'bg-indigo-900/30 text-indigo-400',
    amber: 'bg-amber-900/30 text-amber-400',
  };

  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700 shadow-sm group relative">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
          {tooltip && (
            <div className="relative group/tooltip">
              <Info className="w-3.5 h-3.5 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-20 pointer-events-none">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold truncate text-white" title={format === 'currency' ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value) : value.toLocaleString()}>
        {format === 'currency' 
          ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
          : value.toLocaleString()}
      </p>
    </div>
  );
}

function DetailRow({ label, value, icon, color = "text-white", format = "currency", tooltip }: { label: string, value: number, icon?: React.ReactNode, color?: string, format?: 'currency' | 'number', tooltip?: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <div className="flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
          {tooltip && (
            <div className="relative group/tooltip">
              <Info className="w-3 h-3 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-20 pointer-events-none font-normal leading-relaxed">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
              </div>
            </div>
          )}
        </div>
      </div>
      <span className={`font-semibold ${color}`}>
        {format === 'currency' 
          ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
          : value.toLocaleString()}
      </span>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#1E293B] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-700"
      >
        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <h3 className="font-bold text-lg text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-6 text-slate-200">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
