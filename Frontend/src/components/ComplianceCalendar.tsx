import { useState, useMemo, useEffect } from "react";
import { 
  Calendar, Filter, Download, Plus, Kanban, 
  AlertTriangle, FileText, MessageSquare, StickyNote, Search, X
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";

const initialDocumentData = [
  // January 
  { id: 111, date: "2026-01-10", documentName: "Missing Tax Form", department: "Finance", status: "pending", notes: [] },
  { id: 101, date: "2026-01-15", documentName: "Q1 Strategy Plan", department: "Operations", status: "completed", notes: [] },
  { id: 112, date: "2026-01-20", documentName: "New Year Onboarding", department: "HR", status: "completed", notes: [] },
  { id: 102, date: "2026-01-28", documentName: "Annual Budget Draft", department: "Finance", status: "completed", notes: [] },
  
  // February
  { id: 113, date: "2026-02-15", documentName: "Feb Compliance Check", department: "Legal", status: "pending", notes: [] },
  { id: 114, date: "2026-02-28", documentName: "Payroll Processing", department: "Finance", status: "completed", notes: [] },

  // March 
  { id: 1, date: "2026-03-01", documentName: "Problem Statement Document", department: "Operations", status: "completed", notes: [] },
  { id: 2, date: "2026-03-05", documentName: "Project Scope Document", department: "Legal", status: "completed", notes: ["Approved by board."] },
  { id: 3, date: "2026-03-07", documentName: "GST Tax Filing", department: "Finance", status: "pending", notes: [] },
  { id: 4, date: "2026-03-09", documentName: "Project Guide Approval", department: "HR", status: "pending", notes: ["Needs signature ASAP"] },
  { id: 5, date: "2026-03-11", documentName: "Risk Assessment Document", department: "Legal", status: "pending", notes: [] },
  { id: 6, date: "2026-03-12", documentName: "API Specification", department: "IT", status: "pending", notes: [] },
  { id: 7, date: "2026-03-16", documentName: "UI/UX Wireframes", department: "IT", status: "pending", notes: [] },
  { id: 8, date: "2026-03-25", documentName: "Quarterly Audit", department: "Finance", status: "pending", notes: ["Gathering docs"] },

  // April
  { id: 9, date: "2026-04-05", documentName: "Frontend Setup Doc", department: "IT", status: "pending", notes: [] },
  { id: 115, date: "2026-04-10", documentName: "Q2 Marketing Plan", department: "Operations", status: "pending", notes: [] },
  { id: 116, date: "2026-04-22", documentName: "April Vendor Payments", department: "Finance", status: "pending", notes: [] },

  // May
  { id: 117, date: "2026-05-05", documentName: "Office Lease Renewal", department: "Operations", status: "pending", notes: [] },
  { id: 106, date: "2026-05-18", documentName: "Annual Compliance Training", department: "HR", status: "pending", notes: [] },

  // June
  { id: 103, date: "2026-06-10", documentName: "Mid-Year Employee Reviews", department: "HR", status: "pending", notes: [] },
  { id: 104, date: "2026-06-30", documentName: "Q2 Financial Close", department: "Finance", status: "pending", notes: [] },

  // July
  { id: 105, date: "2026-07-15", documentName: "Server Infrastructure Audit", department: "IT", status: "pending", notes: ["Scheduled downtime required"] },

  // September
  { id: 107, date: "2026-09-01", documentName: "Fall Safety Inspection", department: "Operations", status: "pending", notes: [] },

  // October
  { id: 108, date: "2026-10-31", documentName: "Q3 Board Packet Submission", department: "Legal", status: "pending", notes: [] },

  // November
  { id: 109, date: "2026-11-20", documentName: "Year-End Tax Prep", department: "Finance", status: "pending", notes: [] },

  // December
  { id: 110, date: "2026-12-15", documentName: "Holiday Closure Notice", department: "Operations", status: "pending", notes: [] },
];

export default function ComplianceCalendar() {
  const [docs, setDocs] = useState<any[]>(initialDocumentData);
  const [viewMode, setViewMode] = useState<"calendar" | "kanban">("calendar");
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [searchDate, setSearchDate] = useState(""); 
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);

  // Modals & Edits
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDayDocs, setSelectedDayDocs] = useState<any[] | null>(null);
  const [editingDeptId, setEditingDeptId] = useState<number | string | null>(null); 
  const [editingStatusId, setEditingStatusId] = useState<number | string | null>(null); // NEW: Track status edit

  // Manual Add Form States 
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newTaskDept, setNewTaskDept] = useState("Operations");

  // Sticky Note States
  const [dateNotes, setDateNotes] = useState<Record<string, string>>({});
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [activeNoteDate, setActiveNoteDate] = useState("");
  const [activeNoteText, setActiveNoteText] = useState("");

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const departments = ["Operations", "Finance", "Legal", "HR", "IT", "General"]; 
  const statuses = ["pending", "in-progress", "completed", "delayed"]; // NEW: Added delayed

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- FETCH DOCUMENTS FROM MONGODB ---
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch("http://localhost:8000/documents");
        if (!response.ok) return;
        const data = await response.json();
        
        const formattedDocs = data.items
          .map((d: any) => {
            const rawDate = d.selected_deadline || d.uploadDate;
            let formattedDate = "";
            let autoStatus = d.metadata?.status || "pending";

            if (rawDate) {
              const dateObj = new Date(rawDate);
              const year = dateObj.getFullYear();
              const month = String(dateObj.getMonth() + 1).padStart(2, '0');
              const day = String(dateObj.getDate()).padStart(2, '0');
              formattedDate = `${year}-${month}-${day}`;

              // AUTO-COMPLETE LOGIC: If date has passed and no specific status is set, mark as completed
              dateObj.setHours(0,0,0,0);
              if (dateObj < today && !d.metadata?.status) {
                autoStatus = "completed"; 
              }
            }

            return {
              id: d.id, 
              date: formattedDate,             
              documentName: d.filename,
              department: d.route_to || "General",
              status: autoStatus, 
              notes: d.summary ? ["AI Summary Available"] : []
            };
          })
          .filter((d: any) => d.date !== ""); 
          
        setDocs(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newDocs = formattedDocs.filter((fd: any) => !existingIds.has(fd.id));
          return [...prev, ...newDocs];
        });
      } catch (error) {
        console.error("Failed to load DB documents:", error);
      }
    };
    fetchDocuments();
  }, []);

  // --- DRAG AND DROP ---
  const handleDragStart = (e: React.DragEvent, id: string | number) => {
    e.dataTransfer.setData("docId", id.toString());
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("docId");
    
    setDocs(docs.map(d => {
      if (d.id.toString() === draggedId) return { ...d, status: newStatus };
      return d;
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); 
  };

  // --- DEPARTMENT EDITING HANDLER ---
  const handleDepartmentChange = async (docId: string | number, newDept: string) => {
    setDocs(docs.map(d => d.id === docId ? { ...d, department: newDept } : d));
    setEditingDeptId(null);
    if (typeof docId === "string") {
      try {
        await fetch(`http://localhost:8000/documents/${docId}/route`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route_to: newDept, note: "Manually re-routed from Calendar" })
        });
      } catch (err) {
        console.error("Failed to update department in DB:", err);
      }
    }
  };

  // --- STATUS EDITING HANDLER ---
  const handleStatusChange = (docId: string | number, newStatus: string) => {
    setDocs(docs.map(d => d.id === docId ? { ...d, status: newStatus } : d));
    setEditingStatusId(null);
    // (If backend status saving is implemented later, add fetch call here)
  };

  // --- CALENDAR-ONLY HIDE ---
  const handleHideFromCalendar = async (docId: string | number) => {
    setDocs(docs.filter(d => d.id !== docId));
    if (typeof docId === "string") {
      try {
        await fetch(`http://localhost:8000/documents/${docId}/hide`, { method: 'PATCH' });
      } catch (err) {
        console.error("Failed to hide document:", err);
      }
    }
  };

  // --- MANUAL ADD ---
  const handleManualAdd = () => {
    if (!newTaskName || !newTaskDate) return alert("Please fill both fields!");
    const newDoc = {
      id: Date.now(), 
      date: newTaskDate,
      documentName: newTaskName,
      department: newTaskDept, 
      status: "pending",     
      notes: []
    };
    setDocs([...docs, newDoc]);
    setIsAddModalOpen(false);
    setNewTaskName("");
    setNewTaskDate("");
    setNewTaskDept("Operations");
  };

  const toggleUrgent = () => {
    const nextState = !showUrgentOnly;
    setShowUrgentOnly(nextState);
    if (nextState) {
      setSelectedMonth("all"); 
      setSearchDate("");       
    }
  };

  // --- STRICT URGENT FILTERING ---
  const filteredDocuments = useMemo(() => {
    return docs.filter(doc => {
      const docDate = new Date(doc.date);
      
      if (searchDate && doc.date !== searchDate) return false;

      if (!searchDate && selectedMonth !== "all" && docDate.getMonth() !== parseInt(selectedMonth)) return false;
      if (selectedDepartment !== "all" && doc.department !== selectedDepartment) return false;
      
      if (showUrgentOnly) {
        if (doc.status !== "pending") return false;
        const daysDiff = Math.ceil((docDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        if (daysDiff > 1) return false; 
      }

      return true;
    });
  }, [docs, selectedMonth, selectedDepartment, searchDate, showUrgentOnly]);

  const highRiskCount = useMemo(() => {
    return docs.filter(d => {
      if (d.status !== "pending") return false;
      const daysDiff = (new Date(d.date).getTime() - today.getTime()) / (1000 * 3600 * 24);
      return daysDiff <= 1; 
    }).length;
  }, [docs]);

  // --- DYNAMIC STATUS & DATE BASED COLORS ---
  const getEventStyle = (dateStr: string, status: string) => {
    if (status === "delayed") return "bg-gray-800 border-gray-900 text-gray-100 font-bold italic shadow-md";
    if (status === "completed") return "bg-gray-100 border-gray-200 text-gray-500 line-through opacity-70";
    if (status === "in-progress") return "bg-blue-50 border-blue-400 text-blue-900 shadow-sm ring-1 ring-blue-500 font-medium";

    const eventDate = new Date(dateStr);
    const daysDiff = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (daysDiff < 0) return "bg-gray-100 border-gray-200 text-gray-500 line-through opacity-70"; 
    if (daysDiff <= 1) return "bg-red-50 border-red-400 text-red-900 shadow-sm ring-1 ring-red-500 font-bold";
    if (daysDiff <= 5) return "bg-yellow-50 border-yellow-400 text-yellow-900 shadow-sm ring-1 ring-yellow-500 font-medium";
    
    // Ample time
    return "bg-green-50 border-green-400 text-green-900 shadow-sm ring-1 ring-green-500 font-medium"; 
  };

  const getCalendarGrid = () => {
    const grid = [];
    for (let month = 0; month < 12; month++) { 
      if (searchDate) {
        const sDate = new Date(searchDate);
        if (month !== sDate.getMonth()) continue;
      } else if (selectedMonth !== "all" && month !== parseInt(selectedMonth)) continue;
      
      const monthData = { monthName: months[month], monthIndex: month, days: [] as any[] };
      const daysInMonth = new Date(new Date().getFullYear(), month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const currentYear = new Date().getFullYear();
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const docsForDay = filteredDocuments.filter(doc => {
          const d = new Date(doc.date);
          return d.getMonth() === month && d.getDate() === day;
        });
        monthData.days.push({ day, dateStr, documents: docsForDay });
      }
      grid.push(monthData);
    }
    return grid;
  };

  const calendarGrid = getCalendarGrid();

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-[1800px] mx-auto">
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Compliance Calendar</h1>
              <p className="text-gray-600">Track and manage departmental document deadlines.</p>
            </div>
            
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 font-medium transition-colors shadow-sm">
                <Plus className="w-4 h-4" /> Add Deadline
              </button>
            </div>
          </div>

          {highRiskCount > 0 && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <div>
                  <h3 className="text-red-900 font-bold text-sm">Action Required</h3>
                  <p className="text-red-700 text-sm">There are <strong>{highRiskCount} critical pending deadlines</strong> due within 24 hours.</p>
                </div>
              </div>
              <button 
                onClick={toggleUrgent} 
                className={`px-4 py-1.5 text-sm font-semibold rounded transition-colors ${showUrgentOnly ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
              >
                {showUrgentOnly ? "Clear Filter" : "View Urgent"}
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200 flex flex-wrap justify-between items-center gap-4">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button onClick={() => setViewMode('calendar')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                <Calendar className="w-4 h-4" /> Calendar
              </button>
              <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                <Kanban className="w-4 h-4" /> Board
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                <Search className="w-4 h-4 text-gray-500" />
                <input 
                  type="date" 
                  value={searchDate} 
                  onChange={(e) => setSearchDate(e.target.value)} 
                  className="bg-transparent border-none text-gray-700 font-medium focus:ring-0 outline-none w-[120px] text-sm cursor-pointer" 
                  title="Search Specific Date"
                />
                {searchDate && (
                  <button onClick={() => setSearchDate("")} title="Clear Date Search">
                    <X className="w-4 h-4 text-red-500 hover:bg-red-100 rounded-full" />
                  </button>
                )}
              </div>

              <div className="h-6 w-px bg-gray-300"></div>

              <div className="flex items-center gap-2 text-sm">
                <Filter className="w-4 h-4 text-gray-500" />
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border-none bg-transparent font-medium text-gray-700 focus:ring-0 cursor-pointer text-sm p-0 pr-6">
                  <option value="all">All Months</option>
                  {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="border-none bg-transparent font-medium text-gray-700 focus:ring-0 cursor-pointer text-sm p-0 pr-6">
                  <option value="all">All Depts</option>
                  {departments.map((d, i) => <option key={i} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* CALENDAR VIEW */}
          {viewMode === "calendar" && (
            <div className="space-y-8">
              {calendarGrid.length === 0 ? (
                <div className="text-center py-12 text-gray-500">No events found for this filter.</div>
              ) : (
                calendarGrid.map(monthData => (
                  <div key={monthData.monthIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                      <h2 className="text-xl font-bold text-gray-800">{monthData.monthName} {new Date().getFullYear()}</h2>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-px bg-gray-200">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="bg-white py-2 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>
                      ))}
                      
                      {monthData.days.map((dayData, idx) => (
                        <div key={idx} className="bg-white min-h-[140px] p-2 hover:bg-gray-50 transition-colors flex flex-col group/day">
                          
                          <div className="flex justify-between items-start mb-2 group-parent">
                            <span className={`text-sm font-semibold ${dayData.documents.length > 0 || dateNotes[dayData.dateStr] ? 'text-gray-900' : 'text-gray-400'}`}>
                              {dayData.day}
                            </span>
                            <button 
                              onClick={() => {
                                setActiveNoteDate(dayData.dateStr);
                                setActiveNoteText(dateNotes[dayData.dateStr] || "");
                                setIsNoteModalOpen(true);
                              }}
                              className={`p-1 rounded-md transition-opacity ${dateNotes[dayData.dateStr] ? 'opacity-100 text-yellow-600 bg-yellow-50' : 'opacity-0 group-hover/day:opacity-100 text-gray-400 hover:bg-gray-100 hover:text-yellow-600'}`}
                              title="Add Sticky Note"
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {dateNotes[dayData.dateStr] && (
                            <div className="bg-yellow-100 border border-yellow-200 text-yellow-800 text-[11px] p-1.5 rounded-sm mb-2 shadow-sm whitespace-pre-wrap leading-tight cursor-pointer"
                                 onClick={() => { setActiveNoteDate(dayData.dateStr); setActiveNoteText(dateNotes[dayData.dateStr]); setIsNoteModalOpen(true); }}>
                              {dateNotes[dayData.dateStr]}
                            </div>
                          )}

                          <div className="space-y-1.5 flex-1">
                            {dayData.documents.slice(0, 2).map((doc: any) => (
                              <div 
                                key={doc.id}
                                className={`group relative p-1.5 rounded-md border text-xs cursor-pointer transition-all duration-300 ease-out hover:scale-105 hover:-translate-y-1 hover:shadow-lg hover:z-50 ${getEventStyle(doc.date, doc.status)}`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="font-bold truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all pr-4">
                                    {doc.documentName}
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleHideFromCalendar(doc.id); }}
                                    className="opacity-0 group-hover:opacity-100 text-current hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-all"
                                    title="Remove from Calendar"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                
                                <div className="hidden group-hover:block mt-2 pt-2 border-t border-current/20 animate-in fade-in slide-in-from-top-1">
                                  
                                  {/* STATUS EDIT */}
                                  <div className="flex justify-between items-center group/status relative mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Status:</span>
                                    {editingStatusId === doc.id ? (
                                      <select
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => setEditingStatusId(null)}
                                        onChange={(e) => handleStatusChange(doc.id, e.target.value)}
                                        className="text-[10px] uppercase font-bold text-gray-900 bg-white border rounded outline-none p-0.5"
                                      >
                                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-extrabold uppercase bg-white/40 px-1.5 rounded text-current shadow-sm">{doc.status}</span>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setEditingStatusId(doc.id); }}
                                          className="opacity-0 group-hover/status:opacity-100 transition-opacity text-current hover:opacity-75"
                                          title="Edit Status"
                                        >
                                          ✏️
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* DEPARTMENT EDIT */}
                                  <div className="flex justify-between items-center group/dept relative">
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Dept:</span>
                                    {editingDeptId === doc.id ? (
                                      <select
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => setEditingDeptId(null)}
                                        onChange={(e) => handleDepartmentChange(doc.id, e.target.value)}
                                        className="text-[10px] uppercase font-bold text-gray-900 bg-white border rounded outline-none p-0.5"
                                      >
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                      </select>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-extrabold uppercase bg-white/40 px-1.5 rounded text-current shadow-sm">{doc.department}</span>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setEditingDeptId(doc.id); }}
                                          className="opacity-0 group-hover/dept:opacity-100 transition-opacity text-current hover:opacity-75"
                                          title="Edit Department"
                                        >
                                          ✏️
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                </div>
                              </div>
                            ))}
                            
                            {dayData.documents.length > 2 && (
                              <button 
                                onClick={() => setSelectedDayDocs(dayData.documents)}
                                className="w-full text-center text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 py-1 rounded transition-colors"
                              >
                                + {dayData.documents.length - 2} more
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* KANBAN BOARD VIEW */}
          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {['pending', 'in-progress', 'completed', 'delayed'].map(statusCol => (
                <div 
                  key={statusCol} 
                  className="bg-gray-100 rounded-xl p-4 flex flex-col h-[700px] transition-colors hover:bg-gray-200"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, statusCol)}
                >
                  <h3 className="font-bold text-gray-700 uppercase text-sm mb-4 tracking-wider flex justify-between">
                    {statusCol.replace('-', ' ')}
                    <span className="bg-gray-300 text-gray-700 px-2 py-0.5 rounded-full text-xs">
                      {filteredDocuments.filter(d => d.status === statusCol).length}
                    </span>
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {filteredDocuments.filter(d => d.status === statusCol).map(doc => (
                      <div 
                        key={doc.id} 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, doc.id)}
                        className={`group bg-white p-4 rounded-lg shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-xl hover:border-blue-400`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase shadow-sm ${getEventStyle(doc.date, doc.status)}`}>
                            {new Date(doc.date).toLocaleDateString()}
                          </span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleHideFromCalendar(doc.id); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-all"
                            title="Remove from Calendar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <h4 className="font-bold text-gray-900 mb-1">{doc.documentName}</h4>
                        
                        <div className="flex items-center gap-2 group/dept relative mt-2">
                          {editingDeptId === doc.id ? (
                            <select
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => setEditingDeptId(null)}
                              onChange={(e) => handleDepartmentChange(doc.id, e.target.value)}
                              className="text-xs uppercase font-bold text-gray-700 bg-white border border-blue-400 rounded outline-none p-1 w-full"
                            >
                              {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          ) : (
                            <>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <FileText className="w-3 h-3" /> {doc.department}
                              </p>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingDeptId(doc.id); }}
                                className="opacity-0 group-hover/dept:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                                title="Edit Department"
                              >
                                ✏️
                              </button>
                            </>
                          )}
                        </div>
                        
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] uppercase font-bold text-blue-600 mt-3 pt-2 border-t border-gray-100 flex items-center gap-1">
                          Drag to update status
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* MANUAL ADD MODAL WITH DEPARTMENT DROPDOWN */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Add Manual Task</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                <input 
                  type="text" 
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="e.g. Call Client"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select 
                  value={newTaskDept}
                  onChange={(e) => setNewTaskDept(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                >
                  {departments.map((dept, i) => <option key={i} value={dept}>{dept}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input 
                  type="date" 
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button onClick={handleManualAdd} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium shadow-sm">Save Task</button>
            </div>
          </div>
        </div>
      )}

      {/* STICKY NOTE EDIT MODAL */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-yellow-500" />
              Note for {new Date(activeNoteDate).toLocaleDateString()}
            </h2>
            <p className="text-sm text-gray-500 mb-4">Add a quick reminder or context for this day.</p>
            <textarea 
              value={activeNoteText}
              onChange={(e) => setActiveNoteText(e.target.value)}
              placeholder="e.g. Out of office today..."
              className="w-full h-32 border border-yellow-300 bg-yellow-50 rounded-md p-3 focus:ring-2 focus:ring-yellow-500 outline-none resize-none text-yellow-900 shadow-inner"
            />
            <div className="flex justify-between items-center mt-6">
              <button onClick={() => {
                const newNotes = {...dateNotes};
                delete newNotes[activeNoteDate];
                setDateNotes(newNotes);
                setIsNoteModalOpen(false);
              }} className="text-sm text-red-500 hover:text-red-700 px-2 font-medium">Delete Note</button>
              
              <div className="flex gap-2">
                <button onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                <button onClick={() => {
                  if (activeNoteText.trim() === "") {
                    const newNotes = {...dateNotes};
                    delete newNotes[activeNoteDate];
                    setDateNotes(newNotes);
                  } else {
                    setDateNotes({...dateNotes, [activeNoteDate]: activeNoteText});
                  }
                  setIsNoteModalOpen(false);
                }} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-medium shadow-sm">Save Note</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIDE PANEL FOR STACKED DOCS */}
      {selectedDayDocs && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedDayDocs(null)}></div>
          <div className="w-full max-w-md bg-white h-full shadow-2xl relative animate-slide-left p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-6">Documents for Date</h2>
            <div className="flex-1 overflow-y-auto space-y-4">
              {selectedDayDocs.map((doc: any) => (
                 <div key={doc.id} className={`p-4 rounded-lg border shadow-sm ${getEventStyle(doc.date, doc.status)}`}>
                   
                   <div className="flex justify-between items-start mb-2">
                     <h4 className="font-bold">{doc.documentName}</h4>
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleHideFromCalendar(doc.id); }}
                       className="text-current hover:text-red-500 hover:bg-red-50 rounded p-1 transition-all"
                       title="Remove from Calendar"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                   
                   {/* STATUS EDIT */}
                   <div className="flex items-center gap-2 group/status relative mb-1">
                     <span className="text-sm opacity-80">Status: </span>
                     {editingStatusId === doc.id ? (
                        <select
                          autoFocus
                          onBlur={() => setEditingStatusId(null)}
                          onChange={(e) => handleStatusChange(doc.id, e.target.value)}
                          className="text-xs uppercase font-bold text-gray-700 bg-white border border-gray-400 rounded outline-none p-1"
                        >
                          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <>
                          <span className="uppercase font-bold text-sm">{doc.status}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingStatusId(doc.id); }}
                            className="opacity-0 group-hover/status:opacity-100 text-gray-500 hover:text-blue-600 transition-opacity"
                            title="Edit Status"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                   </div>

                   {/* DEPARTMENT EDIT */}
                   <div className="flex items-center gap-2 group/dept relative mb-1">
                     <span className="text-sm opacity-80">Dept: </span>
                     {editingDeptId === doc.id ? (
                        <select
                          autoFocus
                          onBlur={() => setEditingDeptId(null)}
                          onChange={(e) => handleDepartmentChange(doc.id, e.target.value)}
                          className="text-xs uppercase font-bold text-gray-700 bg-white border border-gray-400 rounded outline-none p-1"
                        >
                          {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (
                        <>
                          <span className="uppercase font-bold text-sm">{doc.department}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingDeptId(doc.id); }}
                            className="opacity-0 group-hover/dept:opacity-100 text-gray-500 hover:text-blue-600 transition-opacity"
                            title="Edit Department"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                   </div>

                 </div>
              ))}
            </div>
            <button onClick={() => setSelectedDayDocs(null)} className="mt-4 w-full py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors">
              Close Panel
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}