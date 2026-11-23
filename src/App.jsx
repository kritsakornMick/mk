import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  FileText, Plus, Search, Printer, Edit3, Save, Trash2, 
  CheckCircle, Clock, X, Building2, RefreshCw 
} from 'lucide-react';

export default function App() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // State สำหรับหน้าต่างดูตัวอย่าง / แก้ไขกระดาษ A4
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ดึงข้อมูลจาก Supabase
  const fetchQuotations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotations')
      .select('*, quotation_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching:', error);
      alert('ดึงข้อมูลไม่สำเร็จ: ' + error.message);
    } else {
      setQuotations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  // สร้างใบเสนอราคาใหม่ลง Supabase (แก้เลขเอกสารไม่ให้ซ้ำ)
  const handleCreateNew = async () => {
    const uniqueSuffix = Date.now().toString().slice(-4);
    const docNo = `QT-${new Date().getFullYear()}-${uniqueSuffix}`;
    
    const newHeader = {
      doc_no: docNo,
      customer_name: 'บริษัท ลูกค้าใหม่ จำกัด',
      customer_tax_id: '0105560000000',
      customer_address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
      project_title: 'โครงการพัฒนาระบบและบริการ',
      status: 'pending',
      discount_percent: 0,
      vat_enabled: true,
      wht_percent: 0,
      notes: '1. ยืนราคาภายใน 30 วัน นับจากวันที่เสนอราคา\n2. ชำระเงินมัดจำ 50% ก่อนเริ่มดำเนินงาน'
    };

    const { data: createdDoc, error } = await supabase
      .from('quotations')
      .insert([newHeader])
      .select()
      .single();

    if (error) {
      alert('สร้างเอกสารไม่สำเร็จ: ' + error.message);
      return;
    }

    const defaultItem = {
      quotation_id: createdDoc.id,
      item_name: 'ค่าบริการออกแบบและพัฒนาระบบ',
      description: 'รวมค่าติดตั้งและฝึกอบรมการใช้งาน',
      quantity: 1,
      unit: 'งาน',
      unit_price: 25000,
      discount: 0
    };

    const { data: createdItems } = await supabase
      .from('quotation_items')
      .insert([defaultItem])
      .select();

    const fullDoc = { ...createdDoc, quotation_items: createdItems || [] };
    setQuotations([fullDoc, ...quotations]);
    setSelectedDoc(fullDoc);
    setIsEditing(true);
  };

  // บันทึกการแก้ไขจากหน้ากระดาษ A4 ลง Supabase
  const handleSaveDocument = async () => {
    if (!selectedDoc) return;
    setSaving(true);

    const { id, quotation_items, created_at, ...headerFields } = selectedDoc;

    // 1. อัปเดตหัวเอกสาร
    const { error: headerErr } = await supabase
      .from('quotations')
      .update(headerFields)
      .eq('id', id);

    if (headerErr) {
      alert('บันทึกหัวเอกสารไม่สำเร็จ: ' + headerErr.message);
      setSaving(false);
      return;
    }

    // 2. ลบรายการเก่าแล้วบันทึกชุดใหม่
    await supabase.from('quotation_items').delete().eq('quotation_id', id);
    const itemsToInsert = quotation_items.map(({ id: itemId, ...rest }) => ({
      ...rest,
      quotation_id: id
    }));

    if (itemsToInsert.length > 0) {
      await supabase.from('quotation_items').insert(itemsToInsert);
    }

    await fetchQuotations();
    setSaving(false);
    setIsEditing(false);
    alert('บันทึกข้อมูลลงฐานข้อมูลเรียบร้อยแล้ว!');
  };

  // ลบใบเสนอราคาออกจาก Supabase
  const handleDeleteDocument = async (id, docNo, customerName) => {
    const confirmDelete = window.confirm(`ต้องการลบใบเสนอราคา ${docNo} (${customerName}) ใช่หรือไม่?`);
    if (!confirmDelete) return;

    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', id);

    if (error) {
      alert('ลบเอกสารไม่สำเร็จ: ' + error.message);
      return;
    }

    setQuotations(quotations.filter(doc => doc.id !== id));
    if (selectedDoc?.id === id) {
      setSelectedDoc(null);
    }
  };

  // คำนวณยอดเงินของเอกสาร
  const calculateTotals = (doc) => {
    const items = doc?.quotation_items || [];
    const subtotal = items.reduce((sum, item) => {
      return sum + ((Number(item.quantity) * Number(item.unit_price)) - Number(item.discount || 0));
    }, 0);
    const discountAmount = subtotal * (Number(doc?.discount_percent || 0) / 100);
    const afterDiscount = subtotal - discountAmount;
    const vatAmount = doc?.vat_enabled ? afterDiscount * 0.07 : 0;
    const whtAmount = afterDiscount * (Number(doc?.wht_percent || 0) / 100);
    const grandTotal = afterDiscount + vatAmount - whtAmount;
    return { subtotal, discountAmount, afterDiscount, vatAmount, whtAmount, grandTotal };
  };

  // กรองข้อมูลในตาราง
  const filteredDocs = quotations.filter(doc => {
    const matchSearch = 
      doc.doc_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col no-print">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Company DocHub</h1>
            <p className="text-xs text-slate-400">Supabase Connected</p>
          </div>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium">
            <FileText className="w-5 h-5" />
            รวมใบเสนอราคา
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 no-print">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">รวมใบเสนอราคา (Quotations)</h2>
            <p className="text-slate-500 text-sm">จัดการ สร้าง และแก้ไขเอกสารพร้อมสั่งพิมพ์ PDF</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={fetchQuotations}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
            <button 
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm"
            >
              <Plus className="w-5 h-5" />
              สร้างใบเสนอราคาใหม่
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-wrap gap-4 justify-between items-center">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาเลขที่เอกสาร, ชื่อลูกค้า, โครงการ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'pending', label: 'รออนุมัติ' },
              { id: 'approved', label: 'อนุมัติแล้ว' },
              { id: 'draft', label: 'แบบร่าง' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  statusFilter === tab.id 
                    ? 'bg-slate-900 text-white' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="py-4 px-6 font-semibold">เลขที่เอกสาร</th>
                <th className="py-4 px-6 font-semibold">ลูกค้า / โครงการ</th>
                <th className="py-4 px-6 font-semibold">วันที่ออก</th>
                <th className="py-4 px-6 font-semibold text-right">ยอดสุทธิ</th>
                <th className="py-4 px-6 font-semibold text-center">สถานะ</th>
                <th className="py-4 px-6 font-semibold text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="6" className="text-center py-12 text-slate-400">กำลังโหลดข้อมูลจาก Supabase...</td></tr>
              ) : filteredDocs.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-12 text-slate-400">ยังไม่มีใบเสนอราคา กดปุ่ม "+ สร้างใบเสนอราคาใหม่" ด้านบนได้เลยครับ</td></tr>
              ) : (
                filteredDocs.map(doc => {
                  const { grandTotal } = calculateTotals(doc);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80">
                      <td className="py-4 px-6 font-semibold text-blue-600">{doc.doc_no}</td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-900">{doc.customer_name}</div>
                        <div className="text-xs text-slate-500">{doc.project_title}</div>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-600">{doc.issue_date}</td>
                      <td className="py-4 px-6 text-right font-semibold text-slate-900">
                        ฿{grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          doc.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {doc.status === 'approved' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {doc.status === 'approved' ? 'อนุมัติแล้ว' : doc.status === 'draft' ? 'แบบร่าง' : 'รออนุมัติ'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => { setSelectedDoc(doc); setIsEditing(true); }}
                          className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-4 h-4" /> แก้ไข / พิมพ์
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.id, doc.doc_no, doc.customer_name)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" /> ลบ
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal กระดาษ A4 แก้ไขได้ + สั่งพิมพ์ */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 overflow-y-auto flex flex-col items-center py-6 px-4">
          {/* Toolbar ด้านบน */}
          <div className="w-full max-w-[210mm] bg-slate-800 text-white px-6 py-3.5 rounded-t-2xl flex flex-wrap justify-between items-center gap-3 no-print">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{selectedDoc.doc_no}</span>
              <select
                value={selectedDoc.status}
                onChange={(e) => setSelectedDoc({ ...selectedDoc, status: e.target.value })}
                className="bg-slate-700 text-sm rounded-lg px-3 py-1.5 border border-slate-600"
              >
                <option value="draft">สถานะ: แบบร่าง</option>
                <option value="pending">สถานะ: รออนุมัติ</option>
                <option value="approved">สถานะ: อนุมัติแล้ว</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${
                  isEditing ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-white'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                {isEditing ? 'กำลังแก้ไขเอกสาร' : 'โหมดแก้ไข'}
              </button>
              <button
                onClick={handleSaveDocument}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? 'กำลังบันทึก...' : 'บันทึกลงฐานข้อมูล'}
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                พิมพ์ / PDF
              </button>
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-2 hover:bg-slate-700 rounded-xl text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* หน้ากระดาษ A4 */}
          <div id="printable-a4" className="w-full max-w-[210mm] min-h-[297mm] bg-white p-12 shadow-2xl text-slate-800">
            {/* หัวกระดาษ */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">บริษัท ตัวอย่าง จำกัด (สำนักงานใหญ่)</h2>
                <p className="text-xs text-slate-500 mt-1">999 อาคารออฟฟิศทาวเวอร์ ถนนพระราม 9 กรุงเทพฯ 10310</p>
                <p className="text-xs text-slate-500">เลขประจำตัวผู้เสียภาษี: 0105566001234 | โทร: 02-123-4567</p>
              </div>
              <div className="text-right">
                <h1 className="text-2xl font-bold text-blue-700 tracking-wide">ใบเสนอราคา</h1>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">QUOTATION</p>
                <div className="mt-2 text-sm">
                  <span className="text-slate-500">เลขที่: </span>
                  <span className="font-bold">{selectedDoc.doc_no}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-500">วันที่: </span>
                  <span>{selectedDoc.issue_date}</span>
                </div>
              </div>
            </div>

            {/* ข้อมูลลูกค้า */}
            <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">ข้อมูลลูกค้า (Customer)</div>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={selectedDoc.customer_name}
                    onChange={e => setSelectedDoc({ ...selectedDoc, customer_name: e.target.value })}
                    placeholder="ชื่อบริษัทลูกค้า"
                    className="border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm font-semibold"
                  />
                  <input
                    value={selectedDoc.customer_tax_id || ''}
                    onChange={e => setSelectedDoc({ ...selectedDoc, customer_tax_id: e.target.value })}
                    placeholder="เลขผู้เสียภาษี"
                    className="border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm"
                  />
                  <input
                    value={selectedDoc.customer_address || ''}
                    onChange={e => setSelectedDoc({ ...selectedDoc, customer_address: e.target.value })}
                    placeholder="ที่อยู่ลูกค้า"
                    className="col-span-2 border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm"
                  />
                  <input
                    value={selectedDoc.project_title}
                    onChange={e => setSelectedDoc({ ...selectedDoc, project_title: e.target.value })}
                    placeholder="ชื่อโครงการ"
                    className="col-span-2 border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm font-medium"
                  />
                </div>
              ) : (
                <div className="text-sm space-y-1">
                  <div className="font-bold text-slate-900">{selectedDoc.customer_name}</div>
                  <div className="text-slate-600">{selectedDoc.customer_address}</div>
                  <div className="text-slate-500 text-xs">เลขผู้เสียภาษี: {selectedDoc.customer_tax_id}</div>
                  <div className="pt-1 font-medium text-blue-700">โครงการ: {selectedDoc.project_title}</div>
                </div>
              )}
            </div>

            {/* ตารางรายการ */}
            <table className="w-full text-sm border-collapse mb-6">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3 text-left">รายการสินค้า / บริการ</th>
                  <th className="py-2.5 px-3 text-right w-20">จำนวน</th>
                  <th className="py-2.5 px-3 text-center w-20">หน่วย</th>
                  <th className="py-2.5 px-3 text-right w-28">ราคา/หน่วย</th>
                  <th className="py-2.5 px-3 text-right w-28">จำนวนเงิน</th>
                  {isEditing && <th className="py-2.5 px-2 w-10 no-print"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-300">
                {(selectedDoc.quotation_items || []).map((item, idx) => {
                  const lineTotal = (Number(item.quantity) * Number(item.unit_price)) - Number(item.discount || 0);
                  return (
                    <tr key={idx} className="align-top">
                      <td className="py-3 px-3 text-center text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              value={item.item_name}
                              onChange={e => {
                                const updated = [...selectedDoc.quotation_items];
                                updated[idx].item_name = e.target.value;
                                setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                              }}
                              className="w-full border border-amber-300 bg-amber-50/40 px-2 py-1 rounded font-medium"
                            />
                            <input
                              value={item.description || ''}
                              onChange={e => {
                                const updated = [...selectedDoc.quotation_items];
                                updated[idx].description = e.target.value;
                                setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                              }}
                              placeholder="รายละเอียดเพิ่มเติม"
                              className="w-full border border-amber-200 px-2 py-0.5 rounded text-xs text-slate-500"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-slate-900">{item.item_name}</div>
                            {item.description && <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => {
                              const updated = [...selectedDoc.quotation_items];
                              updated[idx].quantity = Number(e.target.value);
                              setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                            }}
                            className="w-16 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-right"
                          />
                        ) : item.quantity}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isEditing ? (
                          <input
                            value={item.unit}
                            onChange={e => {
                              const updated = [...selectedDoc.quotation_items];
                              updated[idx].unit = e.target.value;
                              setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                            }}
                            className="w-16 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-center"
                          />
                        ) : item.unit}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={e => {
                              const updated = [...selectedDoc.quotation_items];
                              updated[idx].unit_price = Number(e.target.value);
                              setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                            }}
                            className="w-24 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-right"
                          />
                        ) : Number(item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        {lineTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      {isEditing && (
                        <td className="py-3 px-2 text-center no-print">
                          <button
                            onClick={() => {
                              const updated = selectedDoc.quotation_items.filter((_, i) => i !== idx);
                              setSelectedDoc({ ...selectedDoc, quotation_items: updated });
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {isEditing && (
              <button
                onClick={() => setSelectedDoc({
                  ...selectedDoc,
                  quotation_items: [
                    ...(selectedDoc.quotation_items || []),
                    { item_name: 'รายการใหม่', description: '', quantity: 1, unit: 'รายการ', unit_price: 0, discount: 0 }
                  ]
                })}
                className="mb-6 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-200 no-print"
              >
                + เพิ่มรายการสินค้า/บริการ
              </button>
            )}

            {/* สรุปยอดเงินและภาษี */}
            {(() => {
              const { subtotal, discountAmount, vatAmount, whtAmount, grandTotal } = calculateTotals(selectedDoc);
              return (
                <div className="flex justify-between items-start gap-8">
                  <div className="flex-1 text-xs text-slate-600">
                    <div className="font-bold text-slate-700 mb-1">หมายเหตุ / เงื่อนไข:</div>
                    {isEditing ? (
                      <textarea
                        rows="3"
                        value={selectedDoc.notes || ''}
                        onChange={e => setSelectedDoc({ ...selectedDoc, notes: e.target.value })}
                        className="w-full border border-amber-300 bg-amber-50/40 p-2 rounded"
                      />
                    ) : (
                      <p className="whitespace-pre-line">{selectedDoc.notes}</p>
                    )}
                  </div>

                  <div className="w-72 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">รวมเป็นเงิน</span>
                      <span>{subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">
                        ส่วนลด {isEditing && (
                          <input
                            type="number"
                            value={selectedDoc.discount_percent}
                            onChange={e => setSelectedDoc({ ...selectedDoc, discount_percent: Number(e.target.value) })}
                            className="w-12 border border-amber-300 px-1 rounded text-right ml-1"
                          />
                        )}%
                      </span>
                      <span className="text-red-600">-{discountAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-slate-500 flex items-center gap-1.5">
                        {isEditing && (
                          <input
                            type="checkbox"
                            checked={selectedDoc.vat_enabled}
                            onChange={e => setSelectedDoc({ ...selectedDoc, vat_enabled: e.target.checked })}
                          />
                        )}
                        ภาษีมูลค่าเพิ่ม 7%
                      </label>
                      <span>{vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">
                        หัก ณ ที่จ่าย {isEditing ? (
                          <select
                            value={selectedDoc.wht_percent}
                            onChange={e => setSelectedDoc({ ...selectedDoc, wht_percent: Number(e.target.value) })}
                            className="border border-amber-300 rounded px-1 ml-1"
                          >
                            <option value={0}>0%</option>
                            <option value={1}>1%</option>
                            <option value={3}>3%</option>
                            <option value={5}>5%</option>
                          </select>
                        ) : `${selectedDoc.wht_percent}%`}
                      </span>
                      <span className="text-red-600">-{whtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t-2 border-slate-800 pt-2 text-blue-700">
                      <span>ยอดเงินสุทธิ</span>
                      <span>฿{grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}