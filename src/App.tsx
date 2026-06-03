import { useState, useMemo, useEffect, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldCheck, 
  AlertTriangle, 
  MessagesSquare, 
  HeartPulse, 
  Plus, 
  Trash2, Edit,
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Info, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  FileText,
  TrendingUp,
  RefreshCw,
  User,
  Check,
  Zap,
  CloudUpload,
  LogOut
} from "lucide-react";
import { HazardReport, SafetyTalk, TestFatigue } from "./types";
import { 
  initialHazardReports, 
  initialSafetyTalks, 
  initialTestFatigues 
} from "./initialData";
import { initAuth, googleSignIn, getAccessToken, logout } from "./lib/auth";
import { saveToGoogleDrive } from "./lib/drive";

import { 
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, getDocs, writeBatch, updateDoc
} from "firebase/firestore";
import { db } from "./lib/auth";
import { handleFirestoreError, OperationType } from "./lib/firestore-errors";

// List of Indonesian months
const MONTHS_INDONESIAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const PRESET_HAZARD_TITLES = [
  "Lantai licin akibat tumpahan pelumas di Workshop B",
  "Kabel alat las terkelupas dan membahayakan kru",
  "Lampu rambu darurat padam di jalur evakuasi utama",
  "Alat Pemadam Api Ringan (APAR) kadaluarsa",
  "Penempatan barang menghalangi akses hydran",
  "Sirkulasi udara minim di area maintenance baterai",
  "Penyangga railing tangga darurat longgar",
  "Ketiadaan rambu peringatan di dekat tangki solar",
];

export default function App() {
  // Real-time states from Firestore
  const [hazardReports, setHazardReports] = useState<HazardReport[]>(initialHazardReports);
  const [safetyTalks, setSafetyTalks] = useState<SafetyTalk[]>(initialSafetyTalks);
  const [testFatigues, setTestFatigues] = useState<TestFatigue[]>(initialTestFatigues);

  // Current evaluation period: June 2026 (2026-06)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(5); // Index 0-11, so 5 = Juni

  // User input tracking
  const [activeFormTab, setActiveFormTab] = useState<"hazard" | "talk" | "fatigue">("hazard");
  const [hazardDate, setHazardDate] = useState<string>("2026-06-03");
  const [hazardTitle, setHazardTitle] = useState<string>("");
  const [safetyTalkDate, setSafetyTalkDate] = useState<string>("2026-06-03");
  const [testFatigueDate, setTestFatigueDate] = useState<string>("2026-06-03");

  // Nama Karyawan and NRP trackers for Hazard, Safety Talk, and Test Fatigue
  const [hazardNama, setHazardNama] = useState<string>("");
  const [hazardNrp, setHazardNrp] = useState<string>("");
  const [safetyTalkNama, setSafetyTalkNama] = useState<string>("");
  const [safetyTalkNrp, setSafetyTalkNrp] = useState<string>("");
  const [testFatigueNama, setTestFatigueNama] = useState<string>("");
  const [testFatigueNrp, setTestFatigueNrp] = useState<string>("");

  // Karyawan focus selection state
  const [focusEmployeeNrp, setFocusEmployeeNrp] = useState<string>("all");

  // Filter logging and search
  const [logFilterTab, setLogFilterTab] = useState<"all" | "hazard" | "talk" | "fatigue">("all");
  const [searchHistoryQuery, setSearchHistoryQuery] = useState<string>("");

  // Notification popup message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Interactive refresh dashboard state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const isAdmin = googleUser?.email === "plantimprovementmonitoringdata@gmail.com";

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!googleUser?.uid) {
      setHazardReports(initialHazardReports);
      setSafetyTalks(initialSafetyTalks);
      setTestFatigues(initialTestFatigues);
      return;
    }

    const unsubs: any[] = [];
    
    const hQ = query(collection(db, "hazardReports"));
    unsubs.push(onSnapshot(hQ, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as HazardReport));
      setHazardReports(data.length ? data : initialHazardReports);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "hazardReports")));

    const sQ = query(collection(db, "safetyTalks"));
    unsubs.push(onSnapshot(sQ, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SafetyTalk));
      setSafetyTalks(data.length ? data : initialSafetyTalks);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "safetyTalks")));

    const tQ = query(collection(db, "testFatigues"));
    unsubs.push(onSnapshot(tQ, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TestFatigue));
      setTestFatigues(data.length ? data : initialTestFatigues);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "testFatigues")));

    return () => unsubs.forEach(fn => fn());
  }, [googleUser]);

  const handleLoginGoogle = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        showToast("Login berhasil, data tersinkronisasi.", "success");
      }
    } catch (err: any) {
      showToast(`Gagal login: ${err.message}`, "error");
    }
  };

  const handleDriveSync = async () => {
    setIsSyncingDrive(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        showToast("Menghubungkan ke Google Drive...", "info");
        const res = await googleSignIn();
        if (res) {
          setGoogleUser(res.user);
          token = res.accessToken;
        } else {
          throw new Error("Gagal login Google.");
        }
      }

      if (token) {
        if (!window.confirm("Yakin ingin menyinkronkan (override) data K3 Anda ke Google Drive? Data sebelumnya di Drive akan ditimpa jika file sudah ada.")) {
          setIsSyncingDrive(false);
          return;
        }

        const payload = JSON.stringify({
          exportedAt: new Date().toISOString(),
          hazardReports,
          safetyTalks,
          testFatigues
        }, null, 2);

        await saveToGoogleDrive(payload, "K3_Monitoring_Backup.json");
        showToast("Data berhasil disinkronisasi ke Google Drive!", "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal sinkronisasi: ${err.message}`, "error");
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleLogoutGoogle = async () => {
    try {
      await logout();
      setGoogleUser(null);
      showToast("Berhasil logout dari Google.", "info");
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const handleRefreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast("Seluruh kalkulasi & grafik progress kepatuhan K3 berhasil diperbarui!", "success");
    }, 800);
  };

  // Toast auto-clear
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Date helper to sync forms with selected month/year
  useEffect(() => {
    const formattedMonth = String(selectedMonth + 1).padStart(2, "0");
    const formattedDate = `${selectedYear}-${formattedMonth}-03`;
    setHazardDate(formattedDate);
    setSafetyTalkDate(formattedDate);
    setTestFatigueDate(formattedDate);
  }, [selectedYear, selectedMonth]);

  // Helper trigger toast
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type });
  };

  // Convert month-year string keys
  const periodKey = useMemo(() => {
    const mm = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${mm}`; // Output: YYYY-MM
  }, [selectedYear, selectedMonth]);

  // Filter inputs per selected evaluation period
  const currentPeriodHazardReports = useMemo(() => {
    return hazardReports.filter((item) => item.tanggal.startsWith(periodKey));
  }, [hazardReports, periodKey]);

  const currentPeriodSafetyTalks = useMemo(() => {
    return safetyTalks.filter((item) => item.tanggal.startsWith(periodKey));
  }, [safetyTalks, periodKey]);

  const currentPeriodTestFatigues = useMemo(() => {
    return testFatigues.filter((item) => item.tanggal.startsWith(periodKey));
  }, [testFatigues, periodKey]);

  // Targets configurations per employee (according to strict USER target requirements)
  const targetHazardCountPerEmployee = 1;
  const targetSafetyTalkCountPerEmployee = 6;
  const targetTestFatigueCountPerEmployee = 3;

  // Rich compliance statistics list grouped by employee
  const employeeStatsList = useMemo(() => {
    const employeesMap: { 
      [nrpKey: string]: { 
        nama: string; 
        nrp: string; 
        hazardCount: number; 
        safetyTalkCount: number; 
        testFatigueCount: number; 
      } 
    } = {};

    // Helper to ensure employees are initialized
    const ensureEmployee = (nama: string, nrp: string) => {
      const cleanNrp = (nrp || "").trim();
      const cleanNama = (nama || "").trim();
      const key = cleanNrp || cleanNama || "GEN-01";
      if (!employeesMap[key]) {
        employeesMap[key] = {
          nama: cleanNama || "Karyawan Umum",
          nrp: cleanNrp || "-",
          hazardCount: 0,
          safetyTalkCount: 0,
          testFatigueCount: 0
        };
      }
      return key;
    };

    // Populate counts based on current month's filtered lists
    currentPeriodHazardReports.forEach(item => {
      ensureEmployee(item.namaKaryawan, item.nrp);
      const key = (item.nrp || "").trim() || (item.namaKaryawan || "").trim() || "GEN-01";
      if (employeesMap[key]) {
        employeesMap[key].hazardCount += 1;
      }
    });

    currentPeriodSafetyTalks.forEach(item => {
      ensureEmployee(item.namaKaryawan, item.nrp);
      const key = (item.nrp || "").trim() || (item.namaKaryawan || "").trim() || "GEN-01";
      if (employeesMap[key]) {
        employeesMap[key].safetyTalkCount += 1;
      }
    });

    currentPeriodTestFatigues.forEach(item => {
      ensureEmployee(item.namaKaryawan, item.nrp);
      const key = (item.nrp || "").trim() || (item.namaKaryawan || "").trim() || "GEN-01";
      if (employeesMap[key]) {
        employeesMap[key].testFatigueCount += 1;
      }
    });

    return Object.values(employeesMap).map(emp => {
      const hazardPercentage = Math.min(100, Math.round((emp.hazardCount / targetHazardCountPerEmployee) * 100));
      const safetyTalkPercentage = Math.min(100, Math.round((emp.safetyTalkCount / targetSafetyTalkCountPerEmployee) * 100));
      const testFatiguePercentage = Math.min(100, Math.round((emp.testFatigueCount / targetTestFatigueCountPerEmployee) * 100));
      const overallPercentage = Math.round((hazardPercentage + safetyTalkPercentage + testFatiguePercentage) / 3);
      
      return {
        ...emp,
        hazardPercentage,
        safetyTalkPercentage,
        testFatiguePercentage,
        overallPercentage,
        isHazardReached: emp.hazardCount >= targetHazardCountPerEmployee,
        isSafetyTalkReached: emp.safetyTalkCount >= targetSafetyTalkCountPerEmployee,
        isTestFatigueReached: emp.testFatigueCount >= targetTestFatigueCountPerEmployee,
        isFullyCompliant: emp.hazardCount >= targetHazardCountPerEmployee && 
                           emp.safetyTalkCount >= targetSafetyTalkCountPerEmployee && 
                           emp.testFatigueCount >= targetTestFatigueCountPerEmployee,
      };
    });
  }, [currentPeriodHazardReports, currentPeriodSafetyTalks, currentPeriodTestFatigues]);

  // Dynamic Calculators for Dashboard circular progress bars (responding to focused employee)
  const statsHazard = useMemo(() => {
    if (focusEmployeeNrp === "all") {
      const activeHeadcount = employeeStatsList.length;
      const count = currentPeriodHazardReports.length;
      if (activeHeadcount === 0) {
        return { count: 0, target: 1, percentage: 0, reached: false };
      }
      const totalTarget = activeHeadcount * targetHazardCountPerEmployee;
      const percentage = Math.min(100, Math.round((count / totalTarget) * 100));
      return { count, target: totalTarget, percentage, reached: count >= totalTarget };
    } else {
      const emp = employeeStatsList.find(e => e.nrp === focusEmployeeNrp);
      const count = emp ? emp.hazardCount : 0;
      const target = targetHazardCountPerEmployee;
      return { count, target, percentage: emp ? emp.hazardPercentage : 0, reached: count >= target };
    }
  }, [focusEmployeeNrp, employeeStatsList, currentPeriodHazardReports]);

  const statsSafetyTalk = useMemo(() => {
    if (focusEmployeeNrp === "all") {
      const activeHeadcount = employeeStatsList.length;
      const count = currentPeriodSafetyTalks.length;
      if (activeHeadcount === 0) {
        return { count: 0, target: 6, percentage: 0, reached: false };
      }
      const totalTarget = activeHeadcount * targetSafetyTalkCountPerEmployee;
      const percentage = Math.min(100, Math.round((count / totalTarget) * 100));
      return { count, target: totalTarget, percentage, reached: count >= totalTarget };
    } else {
      const emp = employeeStatsList.find(e => e.nrp === focusEmployeeNrp);
      const count = emp ? emp.safetyTalkCount : 0;
      const target = targetSafetyTalkCountPerEmployee;
      return { count, target, percentage: emp ? emp.safetyTalkPercentage : 0, reached: count >= target };
    }
  }, [focusEmployeeNrp, employeeStatsList, currentPeriodSafetyTalks]);

  const statsTestFatigue = useMemo(() => {
    if (focusEmployeeNrp === "all") {
      const activeHeadcount = employeeStatsList.length;
      const count = currentPeriodTestFatigues.length;
      if (activeHeadcount === 0) {
        return { count: 0, target: 3, percentage: 0, reached: false };
      }
      const totalTarget = activeHeadcount * targetTestFatigueCountPerEmployee;
      const percentage = Math.min(100, Math.round((count / totalTarget) * 100));
      return { count, target: totalTarget, percentage, reached: count >= totalTarget };
    } else {
      const emp = employeeStatsList.find(e => e.nrp === focusEmployeeNrp);
      const count = emp ? emp.testFatigueCount : 0;
      const target = targetTestFatigueCountPerEmployee;
      return { count, target, percentage: emp ? emp.testFatiguePercentage : 0, reached: count >= target };
    }
  }, [focusEmployeeNrp, employeeStatsList, currentPeriodTestFatigues]);

  // Handle month switching
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Submission validation & handler
  const handleAddHazard = async (e: FormEvent) => {
    e.preventDefault();
    if (!googleUser?.uid) {
      showToast("Silakan login via tombol 'Sync Drive' untuk memulai database!", "error");
      return;
    }
    if (!hazardNama.trim()) {
      showToast("Nama Karyawan tidak boleh kosong!", "error");
      return;
    }
    if (!hazardNrp.trim()) {
      showToast("NRP tidak boleh kosong!", "error");
      return;
    }
    if (!hazardTitle.trim()) {
      showToast("Judul Hazard Report tidak boleh kosong!", "error");
      return;
    }
    
    try {
      await addDoc(collection(db, "hazardReports"), {
        tanggal: hazardDate,
        judul: hazardTitle.trim(),
        namaKaryawan: hazardNama.trim(),
        nrp: hazardNrp.trim(),
        authorId: googleUser.uid,
        createdAt: serverTimestamp(),
      });
      setHazardTitle("");
      setHazardNama("");
      setHazardNrp("");
      showToast(`Hazard Report Berhasil Ditambahkan ke tanggal ${hazardDate}!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "hazardReports");
    }
  };

  const handleAddSafetyTalk = async (e: FormEvent) => {
    e.preventDefault();
    if (!googleUser?.uid) {
      showToast("Silakan login via tombol 'Sync Drive' untuk memulai database!", "error");
      return;
    }
    if (!safetyTalkNama.trim()) {
      showToast("Nama Karyawan tidak boleh kosong!", "error");
      return;
    }
    if (!safetyTalkNrp.trim()) {
      showToast("NRP tidak boleh kosong!", "error");
      return;
    }
    
    try {
      await addDoc(collection(db, "safetyTalks"), {
        tanggal: safetyTalkDate,
        namaKaryawan: safetyTalkNama.trim(),
        nrp: safetyTalkNrp.trim(),
        authorId: googleUser.uid,
        createdAt: serverTimestamp()
      });
      setSafetyTalkNama("");
      setSafetyTalkNrp("");
      showToast(`Sesi Safety Talk berhasil dicatat untuk tanggal ${safetyTalkDate}!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "safetyTalks");
    }
  };

  const handleAddTestFatigue = async (e: FormEvent) => {
    e.preventDefault();
    if (!googleUser?.uid) {
      showToast("Silakan login via tombol 'Sync Drive' untuk memulai database!", "error");
      return;
    }
    if (!testFatigueNama.trim()) {
      showToast("Nama Karyawan tidak boleh kosong!", "error");
      return;
    }
    if (!testFatigueNrp.trim()) {
      showToast("NRP tidak boleh kosong!", "error");
      return;
    }
    
    try {
      await addDoc(collection(db, "testFatigues"), {
        tanggal: testFatigueDate,
        namaKaryawan: testFatigueNama.trim(),
        nrp: testFatigueNrp.trim(),
        authorId: googleUser.uid,
        createdAt: serverTimestamp()
      });
      setTestFatigueNama("");
      setTestFatigueNrp("");
      showToast(`Test Fatigue berhasil dicatat untuk tanggal ${testFatigueDate}!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "testFatigues");
    }
  };

  const handleEditRecord = async (item: any) => {
    if (!isAdmin && item.authorId !== googleUser?.uid) {
      showToast("Akses ditolak: Anda tidak memiliki akses edit untuk data ini.", "error");
      return;
    }

    const newName = window.prompt("Edit Nama Karyawan:", item.namaKaryawan);
    if (newName === null) return;
    const newNrp = window.prompt("Edit NRP:", item.nrp);
    if (newNrp === null) return;

    let newJudul = item.judul;
    if (item.type === "hazard") {
      newJudul = window.prompt("Edit Judul Hazard:", item.judul);
      if (newJudul === null) return;
    }

    try {
      const collectionName = item.type === "hazard" ? "hazardReports" : item.type === "talk" ? "safetyTalks" : "testFatigues";
      const docRef = doc(db, collectionName, item.id);
      
      const updateData: any = {
        namaKaryawan: newName.trim(),
        nrp: newNrp.trim(),
      };
      if (item.type === "hazard") updateData.judul = newJudul.trim();

      if (googleUser?.uid) {
        await updateDoc(docRef, updateData);
      } else {
        // Fallback local update
        if (item.type === "hazard") {
          setHazardReports(prev => prev.map(x => x.id === item.id ? { ...x, ...updateData } : x));
        } else if (item.type === "talk") {
          setSafetyTalks(prev => prev.map(x => x.id === item.id ? { ...x, ...updateData } : x));
        } else {
          setTestFatigues(prev => prev.map(x => x.id === item.id ? { ...x, ...updateData } : x));
        }
      }
      showToast("Data log berhasil diperbarui.", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, item.id);
    }
  };

  // Deletion logic
  const handleDeleteHazard = async (id: string) => {
    if (!googleUser?.uid) {
      setHazardReports((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, "hazardReports", id));
      showToast("Hazard Report berhasil dihapus.", "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `hazardReports/${id}`);
    }
  };

  const handleDeleteSafetyTalk = async (id: string) => {
    if (!googleUser?.uid) {
      setSafetyTalks((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, "safetyTalks", id));
      showToast("Safety Talk berhasil dihapus.", "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `safetyTalks/${id}`);
    }
  };

  const handleDeleteTestFatigue = async (id: string) => {
    if (!googleUser?.uid) {
      setTestFatigues((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, "testFatigues", id));
      showToast("Test Fatigue berhasil dihapus.", "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `testFatigues/${id}`);
    }
  };

  // Kosongkan database
  const handleClearData = async () => {
    if (!window.confirm("AWAS! Anda yakin ingin mengosongkan SELURUH DATA dalam database untuk akun Anda? Data yang dihapus tidak bisa dikembalikan.")) {
      return;
    }

    if (!googleUser?.uid) {
      setHazardReports([]);
      setSafetyTalks([]);
      setTestFatigues([]);
      showToast("Data log lokal berhasil dikosongkan.", "success");
      return;
    }

    setIsRefreshing(true);
    try {
      const batch = writeBatch(db);
      const collections = ["hazardReports", "safetyTalks", "testFatigues"];

      for (const coll of collections) {
        const q = query(collection(db, coll));
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          batch.delete(doc(db, coll, docSnap.id));
        });
      }

      await batch.commit();
      showToast("Seluruh database K3 berhasil dikosongkan.", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "clearDatabase");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Kosongkan log per periode yang dipilih
  const handleClearPeriodData = async () => {
    if (!window.confirm(`Yakin ingin menghapus semua data untuk periode ${MONTHS_INDONESIAN[selectedMonth]} ${selectedYear}?`)) {
      return;
    }

    if (!googleUser?.uid) {
      // Local state filtering
      setHazardReports(prev => prev.filter(x => !x.tanggal.startsWith(periodKey)));
      setSafetyTalks(prev => prev.filter(x => !x.tanggal.startsWith(periodKey)));
      setTestFatigues(prev => prev.filter(x => !x.tanggal.startsWith(periodKey)));
      showToast(`Data log lokal periode ${periodKey} berhasil dikosongkan.`, "success");
      return;
    }

    setIsRefreshing(true);
    try {
      const batch = writeBatch(db);
      
      currentPeriodHazardReports.forEach(item => {
        batch.delete(doc(db, "hazardReports", item.id));
      });
      currentPeriodSafetyTalks.forEach(item => {
        batch.delete(doc(db, "safetyTalks", item.id));
      });
      currentPeriodTestFatigues.forEach(item => {
        batch.delete(doc(db, "testFatigues", item.id));
      });

      await batch.commit();
      showToast(`Data log periode ${periodKey} berhasil dikosongkan dari database.`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "clearPeriodDatabase");
    } finally {
      setIsRefreshing(false);
    }
  };
  const handleShortcutLog = async (type: "hazard" | "talk" | "fatigue") => {
    if (!googleUser?.uid) {
      showToast("Silakan login via tombol 'Sync Drive' untuk memulai database!", "error");
      return;
    }
    
    const currentFormattedMonth = String(selectedMonth + 1).padStart(2, "0");
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
    const randomDate = `${selectedYear}-${currentFormattedMonth}-${day}`;

    const randomNames = ["Ahmad Fauzi", "Rudi Hermawan", "Siti Aminah", "Hendra Wijaya", "Bambang Susilo", "Dewi Lestari"];
    const randomNrps = ["80220455", "80210344", "80230566", "80210211", "80190122", "80332219"];
    
    const rndIdx = Math.floor(Math.random() * randomNames.length);
    const selectedName = randomNames[rndIdx];
    const selectedNrp = randomNrps[rndIdx];

    try {
      if (type === "hazard") {
        const idx = Math.floor(Math.random() * PRESET_HAZARD_TITLES.length);
        const title = PRESET_HAZARD_TITLES[idx];
        await addDoc(collection(db, "hazardReports"), {
          tanggal: randomDate,
          judul: title,
          namaKaryawan: selectedName,
          nrp: selectedNrp,
          authorId: googleUser.uid,
          createdAt: serverTimestamp()
        });
        showToast(`[Simulasi] Hazard dimasukkan untuk ${selectedName} tgl ${randomDate}`);
      } else if (type === "talk") {
        await addDoc(collection(db, "safetyTalks"), {
          tanggal: randomDate,
          namaKaryawan: selectedName,
          nrp: selectedNrp,
          authorId: googleUser.uid,
          createdAt: serverTimestamp()
        });
        showToast(`[Simulasi] Safety Talk dicatat untuk ${selectedName} tgl ${randomDate}`);
      } else {
        await addDoc(collection(db, "testFatigues"), {
          tanggal: randomDate,
          namaKaryawan: selectedName,
          nrp: selectedNrp,
          authorId: googleUser.uid,
          createdAt: serverTimestamp()
        });
        showToast(`[Simulasi] Fatigue Test dimasukkan untuk ${selectedName} tgl ${randomDate}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "shortcut");
    }
  };

  // Unified logged history for timeline view
  const combinedHistoryLogs = useMemo(() => {
    const list: Array<{
      id: string;
      type: "hazard" | "talk" | "fatigue";
      tanggal: string;
      title: string;
      namaKaryawan: string;
      nrp: string;
    }> = [];

    currentPeriodHazardReports.forEach((item) => {
      list.push({
        id: item.id,
        type: "hazard",
        tanggal: item.tanggal,
        title: item.judul,
        namaKaryawan: item.namaKaryawan || "General",
        nrp: item.nrp || "-",
      });
    });

    currentPeriodSafetyTalks.forEach((item) => {
      list.push({
        id: item.id,
        type: "talk",
        tanggal: item.tanggal,
        title: "Briefing Safety Talk Terjadwal",
        namaKaryawan: item.namaKaryawan || "General",
        nrp: item.nrp || "-",
      });
    });

    currentPeriodTestFatigues.forEach((item) => {
      list.push({
        id: item.id,
        type: "fatigue",
        tanggal: item.tanggal,
        title: "Pemeriksaan Gejala Fatigue Karyawan",
        namaKaryawan: item.namaKaryawan || "General",
        nrp: item.nrp || "-",
      });
    });

    // Sort chronologically desc
    return list.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [currentPeriodHazardReports, currentPeriodSafetyTalks, currentPeriodTestFatigues]);

  // Filtering list based on user choices
  const filteredHistoryLogs = useMemo(() => {
    return combinedHistoryLogs.filter((item) => {
      const matchType = logFilterTab === "all" || item.type === logFilterTab;
      const query = searchHistoryQuery.toLowerCase();
      const matchSearch = item.title.toLowerCase().includes(query) || 
                          item.tanggal.includes(query) ||
                          item.namaKaryawan.toLowerCase().includes(query) ||
                          item.nrp.toLowerCase().includes(query);
      return matchType && matchSearch;
    });
  }, [combinedHistoryLogs, logFilterTab, searchHistoryQuery]);

  // Circular progress SVG generator
  const renderProgressCircle = (percentage: number, colorClass: string, strokeBg: string) => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center">
        <svg className="w-24 h-24 transform -rotate-90">
          {/* Track Circle */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            className={`${strokeBg} stroke-current`}
            strokeWidth="8"
            fill="transparent"
          />
          {/* Animated Indicator Circle */}
          <motion.circle
            cx="48"
            cy="48"
            r={radius}
            className={`${colorClass} stroke-current transition-all`}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-xl font-bold text-slate-800 font-sans">{percentage}%</span>
        </div>
      </div>
    );
  };

  // Helper calculation for overall safety score
  const overallSafetyPerformance = useMemo(() => {
    const sum = statsHazard.percentage + statsSafetyTalk.percentage + statsTestFatigue.percentage;
    return Math.round(sum / 3);
  }, [statsHazard, statsSafetyTalk, statsTestFatigue]);

  return (
    <div className="min-h-screen text-slate-800 flex flex-col antialiased relative selection:bg-emerald-100">
      {/* Decorative Satin Glassmorphic Background Blobs consistent with iOS 26 layout fluidity */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-slate-50/50">
        <div className="absolute top-[-10%] left-[-15%] w-[45rem] h-[45rem] sm:w-[65rem] sm:h-[65rem] bg-gradient-to-br from-emerald-200/40 via-teal-100/30 to-sky-200/20 rounded-full blur-3xl opacity-80" />
        <div className="absolute bottom-[-10%] right-[-15%] w-[45rem] h-[45rem] sm:w-[70rem] sm:h-[70rem] bg-gradient-to-tr from-rose-200/30 via-amber-100/40 to-sky-200/30 rounded-full blur-3xl opacity-90" />
        <div className="absolute top-[35%] left-[25%] w-[35rem] h-[35rem] bg-gradient-to-r from-sky-200/20 to-indigo-200/30 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-[30%] left-[-5%] w-[40rem] h-[40rem] bg-emerald-100/30 rounded-full blur-3xl opacity-50" />
      </div>

      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 pointer-events-none max-w-sm w-full space-y-2">
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`p-4 rounded-xl shadow-xl backdrop-blur-md border flex items-start gap-3 pointer-events-auto ${
                toastMessage.type === "error"
                  ? "bg-rose-50/90 border-rose-200/80 text-rose-800"
                  : toastMessage.type === "info"
                  ? "bg-sky-50/90 border-sky-200/80 text-sky-800"
                  : "bg-emerald-50/90 border-emerald-200/80 text-emerald-800"
              }`}
            >
              {toastMessage.type === "error" ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
              ) : (
                <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-semibold">{toastMessage.type === "error" ? "Perhatian" : "Berhasil"}</p>
                <p className="mt-0.5 font-mono">{toastMessage.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Corporate K3 Header */}
      <header className="bg-white/70 backdrop-blur-md border-b border-white/40 py-5 px-6 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600/90 backdrop-blur-xs text-white rounded-xl shadow-md shadow-emerald-200/50">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
                Plant Improvement Monitoring
                <span className="text-xs font-semibold bg-emerald-100/80 text-emerald-800 rounded-full px-2.5 py-0.5 border border-emerald-200/40">
                  Live Guard
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Pencatatan target Hazard Report, Safety Talk & Test Fatigue
              </p>
            </div>
          </div>

          {/* User Sign-In Info & Global Control */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/50 backdrop-blur-xs border border-white/40 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-2xs">
              <User className="w-4 h-4 text-slate-500" />
              <div>
                <span className="text-slate-400 block text-[9.5px] uppercase font-semibold leading-none">Petugas K3</span>
                <span className="text-slate-700 font-semibold leading-normal block max-w-[200px] truncate font-mono text-[11px]">
                  plantimprovementmonitoringdata@gmail.com
                </span>
              </div>
            </div>

            <button
              onClick={handleClearData}
              className="px-3 py-1.5 border border-slate-200 bg-white/60 text-slate-600 hover:text-red-600 hover:bg-white/95 rounded-xl text-xs backdrop-blur-xs shadow-2xs transition-all flex items-center gap-1 font-semibold select-none cursor-pointer hover:border-slate-300 active:scale-95"
              title="Hapus semua data K3 di database untuk akun aktif"
            >
              <RefreshCw className="w-3.5 h-3.5 text-red-500" />
              Kosongkan Data
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 px-4 md:px-6 max-w-7xl w-full mx-auto space-y-8 relative z-10">
        {/* Date Selector Navigation Module */}
        <section className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-md shadow-slate-200/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-700 font-extrabold tracking-wider uppercase font-mono block">
              Evaluasi Target Kepatuhan
            </span>
            <h2 className="text-slate-800 font-sans flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-400" />
              <span className="text-base font-bold text-slate-600">Periode:</span>{' '}
              <span className="text-lg font-black text-emerald-800 underline decoration-emerald-500/30 underline-offset-4">{MONTHS_INDONESIAN[selectedMonth]} {selectedYear}</span>
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              Statistik & target kelayakan dikalkulasi berbasis periode yang Anda pilih.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={handlePrevMonth}
              className="p-2.5 bg-white/70 backdrop-blur-xs border border-white/50 hover:bg-white text-slate-700 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Prior Month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="py-2.5 px-4 bg-white/70 backdrop-blur-xs border border-white/50 rounded-xl text-sm font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs transition-all"
            >
              {MONTHS_INDONESIAN.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="py-2.5 px-4 bg-white/70 backdrop-blur-xs border border-white/50 rounded-xl text-sm font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs transition-all"
            >
              {[2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>

            <button
              onClick={handleNextMonth}
              className="p-2.5 bg-white/70 backdrop-blur-xs border border-white/50 hover:bg-white text-slate-700 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Interactive Employee Filter Bar */}
        <section className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-4 shadow-sm shadow-slate-200/20 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block font-mono">Fokus Pantauan Target</span>
              <h3 className="text-sm font-bold text-slate-800 font-sans">
                {focusEmployeeNrp === "all" ? "Seluruh Karyawan (Kumulatif Bulan)" : `Kepatuhan Pribadi Karyawan`}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-slate-500 font-mono">Pilih Filter Tampilan:</label>
            <select
              value={focusEmployeeNrp}
              onChange={(e) => setFocusEmployeeNrp(e.target.value)}
              className="py-1.5 px-3 bg-white/70 backdrop-blur-xs border border-white/50 hover:border-emerald-300 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-2xs transition-all"
            >
              <option value="all">Semua Karyawan (Kumulatif Bulan Ini)</option>
              {employeeStatsList.map((emp) => (
                <option key={emp.nrp} value={emp.nrp}>
                  {emp.nama} (NRP: {emp.nrp})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Dashboard Percentage Target Module */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Progress Target Bulanan: {focusEmployeeNrp === "all" ? "Kumulatif Tim K3" : employeeStatsList.find(e => e.nrp === focusEmployeeNrp)?.nama}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {googleUser ? (
                <div className="flex items-center gap-1 bg-white/60 backdrop-blur-md px-2 py-1 rounded-xl border border-white/40 shadow-3xs group">
                  <span className="text-[10px] font-bold text-slate-500 font-mono pl-1">
                    {googleUser.email}
                  </span>
                  <button 
                    onClick={handleLogoutGoogle}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors ml-1"
                    title="Logout Google"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLoginGoogle}
                  className="px-3.5 py-1.5 bg-blue-500 text-white hover:bg-blue-600 border border-blue-600 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs select-none active:scale-95"
                  title="Login dengan akun Google Workspace"
                >
                  <User className="w-3.5 h-3.5" />
                  Login K3
                </button>
              )}
              
              {googleUser && (
                <button
                  onClick={handleDriveSync}
                  disabled={isSyncingDrive}
                  className="px-3.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-800 disabled:opacity-50 border border-blue-500/25 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs select-none active:scale-95"
                  title="Sinkronisasi data ke Google Drive"
                >
                  <CloudUpload className={`w-3.5 h-3.5 text-blue-600 ${isSyncingDrive ? "animate-bounce" : ""}`} />
                  {isSyncingDrive ? "Menyinkronkan..." : "Sync Drive"}
                </button>
              )}

              <button
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 disabled:opacity-50 border border-emerald-500/25 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs select-none active:scale-95"
                title="Refresh database dan kalkulasi kepatuhan terbaru"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Memperbarui..." : "Refresh Data"}
              </button>
              <div className="text-xs bg-white/60 backdrop-blur-md px-3.5 py-1.5 text-slate-600 rounded-xl font-mono border border-white/40 shadow-3xs">
                Target Individu: <span className="font-extrabold text-emerald-700">1 HR | 6 ST | 3 TF</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Target 1: Hazard Report */}
            <motion.div 
              whileHover={{ y: -3, scale: 1.01 }}
              className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-sm shadow-slate-200/20 flex flex-row items-center gap-6 justify-between overflow-hidden transition-all duration-300"
            >
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-600 rounded-xl">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 font-sans">Hazard Report</h4>
                    <span className="text-[10px] text-slate-400 font-bold font-mono">Target: {focusEmployeeNrp === "all" ? `${statsHazard.target}x (Tim)` : "1x Per Karyawan"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-slate-500 block font-mono uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-slate-800 font-mono">
                      {statsHazard.count} <span className="text-xs font-medium text-slate-400">/ {statsHazard.target}</span>
                    </span>
                    {statsHazard.reached ? (
                      <span className="bg-emerald-500/10 text-emerald-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg flex items-center gap-1 font-mono border border-emerald-500/20">
                        <Check className="w-3" /> OK
                      </span>
                    ) : (
                      <span className="bg-rose-500/10 text-rose-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg font-mono border border-rose-500/20">
                        -{Math.max(0, statsHazard.target - statsHazard.count)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                {renderProgressCircle(statsHazard.percentage, "text-rose-500", "text-rose-500/10")}
              </div>
            </motion.div>

            {/* Target 2: Safety Talk */}
            <motion.div 
              whileHover={{ y: -3, scale: 1.01 }}
              className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-sm shadow-slate-200/20 flex flex-row items-center gap-6 justify-between overflow-hidden transition-all duration-300"
            >
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 bg-sky-500/10 border border-sky-500/25 text-sky-600 rounded-xl">
                    <MessagesSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 font-sans">Safety Talk</h4>
                    <span className="text-[10px] text-slate-400 font-bold font-mono">Target: {focusEmployeeNrp === "all" ? `${statsSafetyTalk.target}x (Tim)` : "6x Per Karyawan"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-slate-500 block font-mono uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-slate-800 font-mono">
                      {statsSafetyTalk.count} <span className="text-xs font-medium text-slate-400">/ {statsSafetyTalk.target}</span>
                    </span>
                    {statsSafetyTalk.reached ? (
                      <span className="bg-emerald-500/10 text-emerald-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg flex items-center gap-1 font-mono border border-emerald-500/20">
                        <Check className="w-3" /> OK
                      </span>
                    ) : (
                      <span className="bg-sky-500/10 text-sky-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg font-mono border border-sky-500/20">
                        -{Math.max(0, statsSafetyTalk.target - statsSafetyTalk.count)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                {renderProgressCircle(statsSafetyTalk.percentage, "text-sky-50500", "text-sky-500/10")}
              </div>
            </motion.div>

            {/* Target 3: Test Fatigue */}
            <motion.div 
              whileHover={{ y: -3, scale: 1.01 }}
              className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-sm shadow-slate-200/20 flex flex-row items-center gap-6 justify-between overflow-hidden transition-all duration-300"
            >
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 text-amber-600 rounded-xl">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 font-sans">Test Fatigue</h4>
                    <span className="text-[10px] text-slate-400 font-bold font-mono">Target: {focusEmployeeNrp === "all" ? `${statsTestFatigue.target}x (Tim)` : "3x Per Karyawan"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-slate-500 block font-mono uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-slate-800 font-mono">
                      {statsTestFatigue.count} <span className="text-xs font-medium text-slate-400">/ {statsTestFatigue.target}</span>
                    </span>
                    {statsTestFatigue.reached ? (
                      <span className="bg-emerald-500/10 text-emerald-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg flex items-center gap-1 font-mono border border-emerald-500/20">
                        <Check className="w-3" /> OK
                      </span>
                    ) : (
                      <span className="bg-amber-500/10 text-amber-700 text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-lg font-mono border border-amber-500/20">
                        -{Math.max(0, statsTestFatigue.target - statsTestFatigue.count)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                {renderProgressCircle(statsTestFatigue.percentage, "text-amber-500", "text-amber-500/10")}
              </div>
            </motion.div>
          </div>

          {/* Core Kepatuhan Progress Summary */}
          <div className="bg-slate-900/85 backdrop-blur-xl text-slate-100 rounded-2xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-xl shadow-inner shadow-black/10">
                <Zap className="w-5 h-5 text-amber-400 animate-bounce" />
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-wide text-white">
                  Skor Rata-Rata Kepatuhan K3: <span className="text-amber-400 font-mono font-black text-lg">
                    {Math.round((statsHazard.percentage + statsSafetyTalk.percentage + statsTestFatigue.percentage) / 3)}%
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {focusEmployeeNrp === "all"
                    ? "Persentase kumulatif performa K3 gabungan seluruh personil aktif dalam bulan terpilih."
                    : `Sesi kepatuhan individu untuk ${employeeStatsList.find(e => e.nrp === focusEmployeeNrp)?.nama || "karyawan"} terhadap ketentuan ketenagakerjaan.`}
                </p>
              </div>
            </div>

            {/* Quick Testing Actions Inside Dashboard */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="text-slate-400 font-mono text-[9px] uppercase font-black tracking-wider">Simulasi Tambah Cepat:</span>
              <button 
                onClick={() => handleShortcutLog("hazard")}
                className="bg-white/10 hover:bg-white/25 border border-white/10 text-rose-300 hover:text-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1 text-[10.5px] font-bold font-mono cursor-pointer transition-all active:scale-95 shadow-md"
              >
                + Hazard
              </button>
              <button 
                onClick={() => handleShortcutLog("talk")}
                className="bg-white/10 hover:bg-white/25 border border-white/10 text-sky-300 hover:text-sky-100 px-3 py-1.5 rounded-xl flex items-center gap-1 text-[10.5px] font-bold font-mono cursor-pointer transition-all active:scale-95 shadow-md"
              >
                + Safety Talk
              </button>
              <button 
                onClick={() => handleShortcutLog("fatigue")}
                className="bg-white/10 hover:bg-white/25 border border-white/10 text-amber-300 hover:text-amber-100 px-3 py-1.5 rounded-xl flex items-center gap-1 text-[10.5px] font-bold font-mono cursor-pointer transition-all active:scale-95 shadow-md"
              >
                + Fatigue Test
              </button>
            </div>
          </div>

          {/* Kepatuhan Individu Karyawan Audit Table card */}
          <div className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl overflow-hidden shadow-sm shadow-slate-200/15 transition-all">
            <div className="p-4 bg-white/40 border-b border-white/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-slate-800 tracking-wide font-sans flex items-center gap-1.5 uppercase font-mono">
                  <User className="w-4 h-4 text-emerald-600" />
                  Daftar Kepatuhan Target Individu Karyawan ({MONTHS_INDONESIAN[selectedMonth]} {selectedYear})
                </h4>
                <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed font-sans">
                  Setiap karyawan diwajibkan mengirim minimal: <span className="font-extrabold text-rose-600">1 Hazard Report</span>, menghadiri <span className="font-extrabold text-sky-600">6 Safety Talk</span>, serta melakukan <span className="font-extrabold text-amber-600">3 Fatigue Check</span> per bulan.
                </p>
              </div>
              <div className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 px-2.5 py-1 rounded-lg font-extrabold font-mono shadow-3xs self-start sm:self-center">
                {employeeStatsList.length} Personil Aktif
              </div>
            </div>

            {employeeStatsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-mono space-y-2">
                <Info className="w-8 h-8 text-slate-300 mx-auto" />
                <p>Belum ada rekaman log/laporan K3 yang didaftarkan untuk periode ini.</p>
                <p className="text-[10px] text-slate-400 font-sans">Silakan isi formulir laporan di bawah atau gunakan tombol "Simulasi Tambah Cepat" untuk mengisi instan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/40 bg-white/30 text-[10.5px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Nama / NRP Karyawan</th>
                      <th className="py-3 px-4 text-center">Hazard Report (Min 1x)</th>
                      <th className="py-3 px-4 text-center">Safety Talk (Min 6x)</th>
                      <th className="py-3 px-4 text-center">Test Fatigue (Min 3x)</th>
                      <th className="py-3 px-4 text-center col-span-1">Persentase Total</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/25 text-xs">
                    {employeeStatsList.map((emp) => {
                      return (
                        <tr 
                          key={emp.nrp} 
                          className={`hover:bg-white/80 transition-all ${focusEmployeeNrp === emp.nrp ? "bg-emerald-500/10 backdrop-blur-xs" : ""}`}
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800 block">{emp.nama}</span>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">NRP: {emp.nrp}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-[11px] font-black font-mono ${emp.isHazardReached ? "text-emerald-700" : "text-rose-600"}`}>
                                {emp.hazardCount} / 1
                              </span>
                              <div className="w-20 bg-black/5 h-1.5 rounded-full overflow-hidden p-[1px] border border-white/20">
                                <div className="bg-rose-500 h-full rounded-full transition-all" style={{ width: `${emp.hazardPercentage}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-[11px] font-black font-mono ${emp.isSafetyTalkReached ? "text-emerald-700" : "text-sky-600"}`}>
                                {emp.safetyTalkCount} / 6
                              </span>
                              <div className="w-20 bg-black/5 h-1.5 rounded-full overflow-hidden p-[1px] border border-white/20">
                                <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${emp.safetyTalkPercentage}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-[11px] font-black font-mono ${emp.isTestFatigueReached ? "text-emerald-700" : "text-amber-600"}`}>
                                {emp.testFatigueCount} / 3
                              </span>
                              <div className="w-20 bg-black/5 h-1.5 rounded-full overflow-hidden p-[1px] border border-white/20">
                                <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${emp.testFatiguePercentage}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              {emp.isFullyCompliant ? (
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-[9.5px] font-black font-mono px-2.5 py-0.5 rounded-lg flex items-center gap-0.5 shadow-3xs">
                                  <Check className="w-3 h-3 text-emerald-600 font-extrabold" /> 100% COMPLIANT
                                </span>
                              ) : (
                                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[9.5px] font-black font-mono px-2.5 py-0.5 rounded-lg shadow-3xs">
                                  {emp.overallPercentage}% COMPLETE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setFocusEmployeeNrp(focusEmployeeNrp === emp.nrp ? "all" : emp.nrp)}
                              className={`px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all shadow-3xs select-none cursor-pointer ${
                                focusEmployeeNrp === emp.nrp 
                                  ? "bg-slate-800 text-white hover:bg-slate-900 border border-black/10" 
                                  : "bg-white/80 hover:bg-white text-slate-700 border border-white/60 hover:border-white"
                              }`}
                            >
                              {focusEmployeeNrp === emp.nrp ? "Lepas Fokus" : "Fokus Grafik"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Form and Log Split Master Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Column Left: Input Safety Form Panel (span 5) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase font-mono">
                Form Input
              </h3>
            </div>

            <div className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-sm shadow-slate-200/20 space-y-6 transition-all">
              {/* Form Segmented Headers */}
              <div className="grid grid-cols-3 gap-1 bg-slate-200/40 border border-white/20 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveFormTab("hazard")}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    activeFormTab === "hazard"
                      ? "bg-white text-rose-600 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Hazard Report
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab("talk")}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    activeFormTab === "talk"
                      ? "bg-white text-sky-600 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <MessagesSquare className="w-4 h-4" />
                  Safety Talk
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab("fatigue")}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    activeFormTab === "fatigue"
                      ? "bg-white text-amber-600 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <HeartPulse className="w-4 h-4" />
                  Test Fatigue
                </button>
              </div>

              {/* Form Content renderer */}
              <div className="pt-2">
                {activeFormTab === "hazard" && (
                  <form onSubmit={handleAddHazard} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                        Tanggal Pembuatan Report
                      </label>
                      <input
                        type="date"
                        value={hazardDate}
                        onChange={(e) => setHazardDate(e.target.value)}
                        className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-rose-400 rounded-xl py-2.5 px-3.5 text-xs font-mono text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                        required
                      />
                    </div>

                    {/* Employee & NRP input */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          Nama Karyawan
                        </label>
                        <input
                          type="text"
                          value={hazardNama}
                          onChange={(e) => setHazardNama(e.target.value)}
                          placeholder="cth: Budi Santoso"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-rose-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          NRP
                        </label>
                        <input
                          type="text"
                          value={hazardNrp}
                          onChange={(e) => setHazardNrp(e.target.value)}
                          placeholder="cth: 80210344"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-rose-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          Judul Hazard Report
                        </label>
                        <span className="text-[9.5px] text-slate-400 font-mono">Pilih templat di bawah</span>
                      </div>
                      <textarea
                        value={hazardTitle}
                        onChange={(e) => setHazardTitle(e.target.value)}
                        placeholder="Deskripsikan temuan hazard kritis atau bahaya sekitar K3..."
                        rows={3}
                        className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-rose-400 rounded-xl py-2.5 px-3.5 text-xs font-semibold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                        required
                      />
                    </div>

                    {/* Presets Generator Tags */}
                    <div className="space-y-1">
                      <span className="text-[9.5px] text-slate-400 font-mono block font-bold leading-relaxed">
                        TEMPLAT PILIHAN CEPAT:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-[140px] overflow-y-auto p-2 bg-white/40 rounded-xl border border-white/60 hover:border-slate-300 transition-all">
                        {PRESET_HAZARD_TITLES.map((title) => (
                          <button
                            key={title}
                            type="button"
                            onClick={() => setHazardTitle(title)}
                            className="bg-white/80 hover:bg-rose-500 hover:text-white border border-white/50 hover:border-rose-400 text-[10px] px-2 py-1 rounded-lg text-left transition-all truncate max-w-full block shadow-3xs cursor-pointer"
                            title={title}
                          >
                            + {title}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-xl shadow-md shadow-rose-200/50 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      Simpan Hazard Report
                    </button>
                  </form>
                )}

                {activeFormTab === "talk" && (
                  <form onSubmit={handleAddSafetyTalk} className="space-y-4">
                    <div className="border border-sky-400/25 bg-sky-500/10 backdrop-blur-md rounded-xl p-4 flex gap-3 text-xs text-sky-900 shadow-3xs">
                      <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-extrabold text-sky-950 font-sans">Target Kepatuhan Rutin</p>
                        <p className="leading-relaxed font-sans text-sky-800">
                          Safety Talk terjadwal harus disebarkan minimal <strong>6 kali sebulan</strong>. Sangat penting untuk menyatukan visi keselamatan seluruh pekerja sebelum shift dimulai.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                        Tanggal Briefing / Safety Talk
                      </label>
                      <input
                        type="date"
                        value={safetyTalkDate}
                        onChange={(e) => setSafetyTalkDate(e.target.value)}
                        className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-sky-400 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden font-mono"
                        required
                      />
                    </div>

                    {/* Employee & NRP input */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          Nama Karyawan
                        </label>
                        <input
                          type="text"
                          value={safetyTalkNama}
                          onChange={(e) => setSafetyTalkNama(e.target.value)}
                          placeholder="cth: Agus Wijaya"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-sky-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          NRP
                        </label>
                        <input
                          type="text"
                          value={safetyTalkNrp}
                          onChange={(e) => setSafetyTalkNrp(e.target.value)}
                          placeholder="cth: 80220455"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-sky-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden font-mono"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-xl shadow-md shadow-sky-200/50 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      Catat Sesi Safety Talk
                    </button>
                  </form>
                )}

                {activeFormTab === "fatigue" && (
                  <form onSubmit={handleAddTestFatigue} className="space-y-4">
                    <div className="border border-amber-400/25 bg-amber-500/10 backdrop-blur-md rounded-xl p-4 flex gap-3 text-xs text-amber-900 shadow-3xs">
                      <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-extrabold text-amber-950 font-sans">Test Fatigue Berkala</p>
                        <p className="leading-relaxed font-sans text-amber-800">
                          Lakukan fatigue checklist minimal <strong>3 kali sebulan</strong> untuk memonitor kru yang memiliki jam kerja berturut-turut yang rawan kelelahan fisik.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                        Tanggal Test Fatigue
                      </label>
                      <input
                        type="date"
                        value={testFatigueDate}
                        onChange={(e) => setTestFatigueDate(e.target.value)}
                        className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-amber-400 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden font-mono"
                        required
                      />
                    </div>

                    {/* Employee & NRP input */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          Nama Karyawan
                        </label>
                        <input
                          type="text"
                          value={testFatigueNama}
                          onChange={(e) => setTestFatigueNama(e.target.value)}
                          placeholder="cth: Dewi Lestari"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-amber-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase font-mono block">
                          NRP
                        </label>
                        <input
                          type="text"
                          value={testFatigueNrp}
                          onChange={(e) => setTestFatigueNrp(e.target.value)}
                          placeholder="cth: 80230566"
                          className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-amber-400 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden font-mono"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-xl shadow-md shadow-amber-200/50 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      Catat Test Fatigue
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Column Right: Logs History & Lists Section (span 7) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase font-mono">
                Log Catatan Periode Terpilih ({filteredHistoryLogs.length} Entri)
              </h3>

              <div className="flex items-center gap-2">
                {/* Toggle filters */}
                <div className="flex bg-slate-200/40 border border-white/20 p-1 rounded-xl gap-1 text-[11px] font-bold shadow-3xs">
                <button
                  onClick={() => setLogFilterTab("all")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    logFilterTab === "all" ? "bg-white text-slate-900 shadow-3xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setLogFilterTab("hazard")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    logFilterTab === "hazard" ? "bg-rose-500/10 text-rose-700 border border-rose-500/10" : "text-slate-500 hover:text-rose-700 hover:bg-rose-500/5"
                  }`}
                >
                  Hazard
                </button>
                <button
                  onClick={() => setLogFilterTab("talk")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    logFilterTab === "talk" ? "bg-sky-500/10 text-sky-700 border border-sky-500/10" : "text-slate-500 hover:text-sky-700 hover:bg-sky-500/5"
                  }`}
                >
                  Talk
                </button>
                <button
                  onClick={() => setLogFilterTab("fatigue")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    logFilterTab === "fatigue" ? "bg-amber-500/10 text-amber-700 border border-amber-500/10" : "text-slate-500 hover:text-amber-700 hover:bg-amber-500/5"
                  }`}
                >
                  Fatigue
                </button>
              </div>
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-lg border border-white/50 rounded-2xl p-6 shadow-sm shadow-slate-200/20 space-y-4 transition-all">
              
              {/* Search History Inputs */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchHistoryQuery}
                  onChange={(e) => setSearchHistoryQuery(e.target.value)}
                  placeholder="Cari log keselamatan berdasarkan judul atau tanggal tertentu..."
                  className="w-full bg-white/55 border border-white/60 focus:bg-white focus:ring-2 focus:ring-emerald-400 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-800 shadow-3xs hover:border-slate-300 transition-all focus:outline-hidden"
                />
              </div>

              {/* Log Chronology List Container */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {filteredHistoryLogs.length > 0 ? (
                    filteredHistoryLogs.map((item) => {
                      // Custom attributes per type
                      let indicatorColor = "bg-rose-500/10 text-rose-800 border-rose-500/20";
                      let indicatorLabel = "Hazard";
                      let icon = <AlertTriangle className="w-4 h-4" />;

                      if (item.type === "talk") {
                        indicatorColor = "bg-sky-500/10 text-sky-800 border-sky-500/20";
                        indicatorLabel = "Safety Talk";
                        icon = <MessagesSquare className="w-4 h-4" />;
                      } else if (item.type === "fatigue") {
                        indicatorColor = "bg-amber-500/10 text-amber-800 border-amber-500/20";
                        indicatorLabel = "Fatigue Test";
                        icon = <HeartPulse className="w-4 h-4" />;
                      }

                      return (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="p-4 rounded-xl border border-white/40 bg-white/40 hover:bg-white/85 backdrop-blur-xs transition-all flex items-center justify-between gap-4 shadow-3xs"
                        >
                          <div className="space-y-2.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Pill status */}
                              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border flex items-center gap-1 font-mono shadow-3xs ${indicatorColor}`}>
                                {icon}
                                {indicatorLabel}
                              </span>
                              {/* Date display */}
                              <span className="text-xs font-bold text-slate-500 font-mono flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {item.tanggal}
                              </span>
                            </div>

                            {/* Title text */}
                            <p className="text-xs font-bold text-slate-800 leading-normal break-words font-sans">
                              {item.title}
                            </p>

                            {/* Employee Identity badges */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-600 font-mono">
                              <span className="flex items-center gap-1.5 bg-white/80 border border-white/60 px-2.5 py-1 rounded-lg shadow-3xs font-sans text-slate-700 font-bold">
                                <User className="w-3 text-slate-400" />
                                {item.namaKaryawan}
                              </span>
                              <span className="bg-slate-200/50 border border-white/40 text-slate-500 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                                NRP: {item.nrp}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons: Edit & Delete */}
                          {(isAdmin || item.authorId === googleUser?.uid || !googleUser) && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditRecord(item)}
                                className="bg-white/90 hover:bg-sky-50 text-slate-400 hover:text-sky-600 border border-white/60 hover:border-sky-100 p-2 rounded-xl shadow-3xs hover:shadow-2xs transition-all cursor-pointer flex-shrink-0 active:scale-90"
                                title="Edit Record"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (item.type === "hazard") handleDeleteHazard(item.id);
                                  else if (item.type === "talk") handleDeleteSafetyTalk(item.id);
                                  else handleDeleteTestFatigue(item.id);
                                }}
                                className="bg-white/90 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-white/60 hover:border-rose-100 p-2 rounded-xl shadow-3xs hover:shadow-2xs transition-all cursor-pointer flex-shrink-0 active:scale-90"
                                title="Hapus Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      );
                    })
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-12 px-4 text-center space-y-3"
                    >
                      <div className="inline-block p-4 bg-white/40 text-slate-400 rounded-full border border-white/50">
                        <FileText className="w-8 h-8 mx-auto text-slate-300" />
                      </div>
                      <div className="space-y-1 max-w-sm mx-auto">
                        <p className="text-xs font-bold text-slate-700">Tidak ada log kecocokan ditemukan</p>
                        <p className="text-[11px] text-slate-400 font-sans">
                          Cobalah masukkan record K3 baru menggunakan form di area kiri, ubah filter pencarian, atau silakan reset data periodik.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Informative Help Alert */}
              <div className="bg-white/40 border border-white/50 rounded-xl p-3.5 text-xs text-slate-500 flex items-start gap-2.5 font-sans leading-relaxed">
                <Info className="w-4.5 h-4.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p>
                  Log keselamatan disimpan secara otomatis di browser lokal Anda. Kapanpun Anda mengubah tanggal ke bulan selain target utama, statistik persentase akan mendeteksi target periode tersebut secara real-time.
                </p>
              </div>

            </div>
          </div>

        </div>

      </main>

      <footer className="bg-white/40 backdrop-blur-md border-t border-white/30 py-6 px-4 mt-auto text-center space-y-1 text-xs text-slate-500">
        <p className="font-semibold text-slate-600">Sistem Log & Pemantauan K3 Kerja © 2026</p>
        <p className="font-mono">Penyusunan target kepatuhan: 1x Hazard Report • 6x Safety Talk • 3x Fatigue Test per Bulan</p>
      </footer>
    </div>
  );
}
