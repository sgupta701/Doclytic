import { useState, useMemo } from "react";
import { Calendar, Filter } from "lucide-react";
import DashboardLayout from "./DashboardLayout";

const documentData = [
  // January
  { id: 1, date: "2025-01-05", documentName: "Problem Statement Document", documentType: "Project Proposal", phase: "Project Initiation", status: "pending" },
  { id: 2, date: "2025-01-08", documentName: "Project Scope Document", documentType: "Planning", phase: "Project Initiation", status: "pending" },
  { id: 3, date: "2025-01-12", documentName: "Technology Stack Proposal", documentType: "Technical", phase: "Project Initiation", status: "completed" },
  { id: 4, date: "2025-01-15", documentName: "Project Guide Approval Form", documentType: "Administrative", phase: "Project Initiation", status: "completed" },
  { id: 5, date: "2025-01-20", documentName: "Risk Assessment Document", documentType: "Planning", phase: "Project Initiation", status: "pending" },
  { id: 6, date: "2025-01-25", documentName: "Project Charter", documentType: "Administrative", phase: "Project Initiation", status: "in-progress" },
  
  // February
  { id: 7, date: "2025-02-03", documentName: "SRS Document", documentType: "Requirements", phase: "Requirement & Design", status: "pending" },
  { id: 8, date: "2025-02-07", documentName: "Use Case Document", documentType: "Requirements", phase: "Requirement & Design", status: "pending" },
  { id: 9, date: "2025-02-10", documentName: "UI/UX Wireframes", documentType: "Design", phase: "Requirement & Design", status: "pending" },
  { id: 10, date: "2025-02-14", documentName: "System Architecture", documentType: "Design", phase: "Requirement & Design", status: "pending" },
  { id: 11, date: "2025-02-18", documentName: "Database Design", documentType: "Technical", phase: "Requirement & Design", status: "pending" },
  { id: 12, date: "2025-02-22", documentName: "API Specification", documentType: "Technical", phase: "Requirement & Design", status: "pending" },
  { id: 13, date: "2025-02-26", documentName: "Data Flow Diagrams", documentType: "Design", phase: "Requirement & Design", status: "pending" },
  
  // March
  { id: 14, date: "2025-03-05", documentName: "Frontend Setup Doc", documentType: "Technical", phase: "Frontend Development", status: "pending" },
  { id: 15, date: "2025-03-10", documentName: "Component Library", documentType: "Technical", phase: "Frontend Development", status: "pending" },
  { id: 16, date: "2025-03-15", documentName: "Routing Documentation", documentType: "Technical", phase: "Frontend Development", status: "pending" },
  { id: 17, date: "2025-03-20", documentName: "State Management Doc", documentType: "Technical", phase: "Frontend Development", status: "pending" },
  { id: 18, date: "2025-03-25", documentName: "UI Progress Report", documentType: "Progress Report", phase: "Frontend Development", status: "pending" },
  
  // April
  { id: 19, date: "2025-04-02", documentName: "API Integration Doc", documentType: "Technical", phase: "Backend & Integration", status: "pending" },
  { id: 20, date: "2025-04-08", documentName: "Authentication System", documentType: "Technical", phase: "Backend & Integration", status: "pending" },
  { id: 21, date: "2025-04-15", documentName: "Database Integration", documentType: "Technical", phase: "Backend & Integration", status: "pending" },
  { id: 22, date: "2025-04-22", documentName: "Error Handling Doc", documentType: "Technical", phase: "Backend & Integration", status: "pending" },
  { id: 23, date: "2025-04-28", documentName: "Integration Report", documentType: "Progress Report", phase: "Backend & Integration", status: "pending" },
  
  // May
  { id: 24, date: "2025-05-05", documentName: "Test Case Document", documentType: "Testing", phase: "Testing & Validation", status: "pending" },
  { id: 25, date: "2025-05-10", documentName: "Test Results Report", documentType: "Testing", phase: "Testing & Validation", status: "pending" },
  { id: 26, date: "2025-05-15", documentName: "Bug Report Log", documentType: "Testing", phase: "Testing & Validation", status: "pending" },
  { id: 27, date: "2025-05-20", documentName: "Performance Testing", documentType: "Testing", phase: "Testing & Validation", status: "pending" },
  { id: 28, date: "2025-05-25", documentName: "UAT Report", documentType: "Testing", phase: "Testing & Validation", status: "pending" },
  
  // June
  { id: 29, date: "2025-06-05", documentName: "Security Audit", documentType: "Security", phase: "Security & Ethics", status: "pending" },
  { id: 30, date: "2025-06-12", documentName: "Data Protection Policy", documentType: "Security", phase: "Security & Ethics", status: "pending" },
  { id: 31, date: "2025-06-20", documentName: "Ethical Compliance", documentType: "Ethics", phase: "Security & Ethics", status: "pending" },
  
  // July
  { id: 32, date: "2025-07-05", documentName: "Final Project Report", documentType: "Documentation", phase: "Documentation", status: "pending" },
  { id: 33, date: "2025-07-12", documentName: "User Manual", documentType: "Documentation", phase: "Documentation", status: "pending" },
  { id: 34, date: "2025-07-20", documentName: "Technical Documentation", documentType: "Documentation", phase: "Documentation", status: "pending" },
  { id: 35, date: "2025-07-25", documentName: "Future Scope Document", documentType: "Documentation", phase: "Documentation", status: "pending" },
  
  // August
  { id: 36, date: "2025-08-05", documentName: "Source Code Package", documentType: "Submission", phase: "Final Submission", status: "pending" },
  { id: 37, date: "2025-08-12", documentName: "Presentation Slides", documentType: "Submission", phase: "Final Submission", status: "pending" },
  { id: 38, date: "2025-08-18", documentName: "Viva Preparation", documentType: "Submission", phase: "Final Submission", status: "pending" },
  { id: 39, date: "2025-08-25", documentName: "Final Checklist", documentType: "Administrative", phase: "Final Submission", status: "pending" },
];

export default function ComplianceCalendar() {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedDay, setSelectedDay] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const months = ["January", "February", "March", "April", "May", "June", "July", "August"];
  const daysInMonth = 31;

  const filteredDocuments = useMemo(() => {
    return documentData.filter(doc => {
      const docDate = new Date(doc.date);
      const docMonth = docDate.getMonth();
      const docDay = docDate.getDate();
      const weekOfMonth = Math.ceil(docDay / 7);

      if (selectedMonth !== "all" && docMonth !== parseInt(selectedMonth)) return false;
      if (selectedWeek !== "all" && weekOfMonth !== parseInt(selectedWeek)) return false;
      if (selectedDay !== "all" && docDay !== parseInt(selectedDay)) return false;
      if (selectedType !== "all" && doc.documentType !== selectedType) return false;
      if (selectedStatus !== "all" && doc.status !== selectedStatus) return false;

      return true;
    });
  }, [selectedMonth, selectedWeek, selectedDay, selectedType, selectedStatus]);

  const documentTypes = [...new Set(documentData.map(d => d.documentType))];

  // Create calendar grid data
  const getCalendarGrid = () => {
    const grid: Array<{
      monthName: string;
      monthIndex: number;
      weeks: Array<{
        weekNumber: number;
        days: Array<{ day: number; documents: typeof documentData }>;
      }>;
    }> = [];
    
    for (let month = 0; month < 8; month++) {
      const monthData: {
        monthName: string;
        monthIndex: number;
        weeks: Array<{
          weekNumber: number;
          days: Array<{ day: number; documents: typeof documentData }>;
        }>;
      } = {
        monthName: months[month],
        monthIndex: month,
        weeks: []
      };

      for (let week = 1; week <= 5; week++) {
        const weekData: {
          weekNumber: number;
          days: Array<{ day: number; documents: typeof documentData }>;
        } = {
          weekNumber: week,
          days: []
        };

        const startDay = (week - 1) * 7 + 1;
        const endDay = Math.min(week * 7, daysInMonth);

        for (let day = startDay; day <= endDay; day++) {
          const docsForDay = filteredDocuments.filter(doc => {
            const docDate = new Date(doc.date);
            return docDate.getMonth() === month && docDate.getDate() === day;
          });

          weekData.days.push({
            day: day,
            documents: docsForDay
          });
        }

        if (weekData.days.some(d => d.documents.length > 0)) {
          monthData.weeks.push(weekData);
        }
      }

      if (monthData.weeks.length > 0) {
        grid.push(monthData);
      }
    }

    return grid;
  };

  const calendarGrid = getCalendarGrid();

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-500';
      case 'in-progress': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      case 'overdue': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBg = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-50 border-green-200';
      case 'in-progress': return 'bg-blue-50 border-blue-200';
      case 'pending': return 'bg-yellow-50 border-yellow-200';
      case 'overdue': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Compliance Calendar</h1>

        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Month Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Months</option>
                {months.map((month, idx) => (
                  <option key={idx} value={idx}>{month}</option>
                ))}
              </select>
            </div>

            {/* Week Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Week</label>
              <select 
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Weeks</option>
                {[1, 2, 3, 4, 5].map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </div>

            {/* Day Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Day</label>
              <select 
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Days</option>
                {[...Array(31)].map((_, i) => (
                  <option key={i} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>

            {/* Document Type Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Document Type</label>
              <select 
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                {documentTypes.map((type, idx) => (
                  <option key={idx} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select 
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredDocuments.length}</span> of {documentData.length} documents
            </p>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="space-y-6">
          {calendarGrid.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No documents found</h3>
              <p className="text-gray-600">Try adjusting your filters to see more results</p>
            </div>
          ) : (
            calendarGrid.map(monthData => (
              <div key={monthData.monthIndex} className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Month Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    {monthData.monthName} 2025
                  </h2>
                </div>

                {/* Week Grid */}
                <div className="p-4">
                  {monthData.weeks.map(weekData => (
                    <div key={weekData.weekNumber} className="mb-4 last:mb-0">
                      <div className="bg-gray-100 px-3 py-2 rounded-t-lg">
                        <h3 className="text-sm font-semibold text-gray-700">Week {weekData.weekNumber}</h3>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-2 p-3 bg-gray-50 rounded-b-lg">
                        {weekData.days.map(dayData => (
                          <div 
                            key={dayData.day}
                            className={`min-h-[120px] border-2 rounded-lg p-2 ${
                              dayData.documents.length > 0 
                                ? 'bg-white border-blue-200' 
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="font-bold text-sm text-gray-900 mb-2">{dayData.day}</div>
                            
                            <div className="space-y-1">
                              {dayData.documents.map(doc => (
                                <div 
                                  key={doc.id}
                                  className={`text-[10px] p-1.5 rounded border ${getStatusBg(doc.status)} group cursor-pointer hover:shadow-md transition-shadow`}
                                  title={`${doc.documentName} - ${doc.documentType}`}
                                >
                                  <div className="flex items-center gap-1 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${getStatusColor(doc.status)}`}></div>
                                    <span className="font-semibold text-gray-900 truncate">{doc.documentName}</span>
                                  </div>
                                  <div className="text-gray-600 truncate">{doc.documentType}</div>
                                  <div className="text-gray-500 text-[9px] mt-0.5">{doc.phase}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow-sm p-4 mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Status Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-700">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs text-gray-700">In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-xs text-gray-700">Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-700">Overdue</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}