import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import speedyPackageExpressLogo from './assets/speedy-package-express-logo.png';
import {
  FileText, Plus, Search, Printer, Edit3, Save, Trash2,
  CheckCircle, Clock, X, Building2, RefreshCw, LayoutDashboard,
  Receipt, FileSpreadsheet, Users, Package, Settings, ArrowRightCircle
} from 'lucide-react';

export default function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard'); // dashboard | quotation | invoice | receipt | customers | products | settings
  const [documents, setDocuments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [company, setCompany] = useState({
    company_name: 'บริษัท สปีดี้ จำกัด (สำนักงานใหญ่)',
    tax_id: '0105566001234',
    address: '999 อาคารออฟฟิศทาวเวอร์ ถนนพระราม 9 กรุงเทพฯ 10310',
    phone: '02-123-4567',
    bank_info: ''
  });

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // State สำหรับหน้าต่างกระดาษ A4
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyLogoFile, setCompanyLogoFile] = useState(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState(null);
  const [documentLogoFile, setDocumentLogoFile] = useState(null);
  const [documentLogoPreview, setDocumentLogoPreview] = useState(null);

  // State สำหรับฟอร์มลูกค้า / สินค้าใหม่
  const [newCustomer, setNewCustomer] = useState({ name: '', tax_id: '', address: '', phone: '' });
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', unit: 'งาน', unit_price: 0 });

  // โหลดข้อมูลทั้งหมดจาก Supabase
  const fetchAllData = async () => {
    setLoading(true);
    const [docsRes, custRes, prodRes, compRes] = await Promise.all([
      supabase.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('company_settings').select('*').eq('id', 1).single()
    ]);

    if (docsRes.data) setDocuments(docsRes.data);
    if (custRes.data) setCustomers(custRes.data);
    if (prodRes.data) setProducts(prodRes.data);
    if (compRes.data) setCompany(compRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // คำนวณยอดเงิน
  const calculateTotals = (doc) => {
    const items = doc?.quotation_items || [];
    const subtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) * Number(item.unit_price)) - Number(item.discount || 0)), 0);
    const discountAmount = subtotal * (Number(doc?.discount_percent || 0) / 100);
    const afterDiscount = subtotal - discountAmount;
    const vatAmount = doc?.vat_enabled ? afterDiscount * 0.07 : 0;
    const whtAmount = afterDiscount * (Number(doc?.wht_percent || 0) / 100);
    const grandTotal = afterDiscount + vatAmount - whtAmount;
    return { subtotal, discountAmount, afterDiscount, vatAmount, whtAmount, grandTotal };
  };

  const getLogoUploadErrorMessage = (error) => {
    if (error.message?.toLowerCase().includes('bucket not found')) {
      return 'ยังไม่มีพื้นที่เก็บโลโก้ใน Supabase กรุณารัน SQL migration 20261123010000_add_company_logo_storage.sql และ 20261123020000_add_document_logo_override.sql ตามลำดับใน Supabase SQL Editor แล้วลองใหม่';
    }
    return error.message;
  };

  // สร้างเอกสารใหม่ตามประเภท (QT / INV / REC)
  const handleCreateDocument = async (type = 'quotation') => {
    const prefixMap = { quotation: 'QT', invoice: 'INV', receipt: 'REC' };
    const uniqueSuffix = Date.now().toString().slice(-4);
    const docNo = `${prefixMap[type]}-${new Date().getFullYear()}-${uniqueSuffix}`;

    const newHeader = {
      doc_no: docNo,
      doc_type: type,
      customer_name: customers[0]?.name || 'บริษัท ลูกค้าใหม่ จำกัด',
      customer_tax_id: customers[0]?.tax_id || '0105560000000',
      customer_address: customers[0]?.address || '123 ถนนสุขุมวิท กรุงเทพฯ 10110',
      project_title: 'โครงการพัฒนาระบบและบริการ',
      status: 'pending',
      discount_percent: 0,
      vat_enabled: true,
      wht_percent: 0,
      notes: '1. ยืนราคาภายใน 30 วัน นับจากวันที่ออกเอกสาร\n2. ชำระเงินโดยโอนเข้าบัญชีบริษัทฯ'
    };

    const { data: createdDoc, error } = await supabase.from('quotations').insert([newHeader]).select().single();
    if (error) return alert('สร้างเอกสารไม่สำเร็จ: ' + error.message);

    const defaultItem = {
      quotation_id: createdDoc.id,
      item_name: products[0]?.name || 'ค่าบริการออกแบบและพัฒนาระบบ',
      description: products[0]?.description || 'รวมค่าติดตั้งและฝึกอบรม',
      quantity: 1,
      unit: products[0]?.unit || 'งาน',
      unit_price: products[0]?.unit_price || 25000,
      discount: 0
    };

    const { data: createdItems } = await supabase.from('quotation_items').insert([defaultItem]).select();
    const fullDoc = { ...createdDoc, quotation_items: createdItems || [] };
    setDocuments([fullDoc, ...documents]);
    setSelectedDoc(fullDoc);
    setIsEditing(true);
  };

  // แปลงเอกสารข้ามขั้นตอน (เช่น QT -> INV หรือ INV -> REC)
  const handleConvertDocument = async (sourceDoc, targetType) => {
    const labelMap = { invoice: 'ใบแจ้งหนี้ (INV)', receipt: 'ใบเสร็จรับเงิน (REC)' };
    const requiredStatus = 'approved';
    const targetLabel = sourceDoc.doc_type === 'invoice'
      ? 'บันทึกสถานะใบแจ้งหนี้ว่าชำระแล้ว'
      : 'ลูกค้าอนุมัติใบเสนอราคาแล้ว';

    if (sourceDoc.status !== requiredStatus) {
      return alert(`ยังออก${labelMap[targetType]}ไม่ได้ กรุณา${targetLabel}ก่อน`);
    }

    const existingDocument = documents.find(doc =>
      doc.doc_type === targetType && String(doc.source_document_id) === String(sourceDoc.id)
    );
    if (existingDocument) {
      return alert(`เอกสารนี้มี${labelMap[targetType]} ${existingDocument.doc_no} แล้ว`);
    }

    if (!window.confirm(`ต้องการสร้าง ${labelMap[targetType]} จากเอกสาร ${sourceDoc.doc_no} ใช่หรือไม่?`)) return;

    const prefixMap = { invoice: 'INV', receipt: 'REC' };
    const uniqueSuffix = Date.now().toString().slice(-4);
    const newDocNo = `${prefixMap[targetType]}-${new Date().getFullYear()}-${uniqueSuffix}`;

    const { id, quotation_items, created_at, doc_no, doc_type, source_document_id, ...restHeader } = sourceDoc;
    const { data: createdDoc, error } = await supabase
      .from('quotations')
      .insert([{
        ...restHeader,
        doc_no: newDocNo,
        doc_type: targetType,
        source_document_id: String(sourceDoc.id),
        status: targetType === 'receipt' ? 'approved' : 'pending'
      }])
      .select()
      .single();

    if (error) return alert('แปลงเอกสารไม่สำเร็จ: ' + error.message);

    const clonedItems = (quotation_items || []).map(({ id: itemId, quotation_id, ...restItem }) => ({
      ...restItem,
      quotation_id: createdDoc.id
    }));

    if (clonedItems.length > 0) {
      const { error: itemsError } = await supabase.from('quotation_items').insert(clonedItems);
      if (itemsError) {
        const { error: cleanupError } = await supabase.from('quotations').delete().eq('id', createdDoc.id);
        const cleanupMessage = cleanupError ? ` และลบเอกสารที่สร้างค้างไว้ไม่สำเร็จ: ${cleanupError.message}` : '';
        return alert('สร้างรายการสินค้าในเอกสารไม่สำเร็จ: ' + itemsError.message + cleanupMessage);
      }
    }

    await fetchAllData();
    setActiveMenu(targetType);
    alert(`สร้าง ${newDocNo} เรียบร้อยแล้ว!`);
  };

  // บันทึกการแก้ไขเอกสาร A4
  const handleSaveDocument = async () => {
    if (!selectedDoc) return;
    const hasChildDocuments = documents.some(doc =>
      String(doc.source_document_id) === String(selectedDoc.id)
    );
    if (hasChildDocuments && selectedDoc.status !== 'approved') {
      return alert('เปลี่ยนสถานะย้อนกลับไม่ได้ เนื่องจากมีการออกเอกสารขั้นตอนถัดไปแล้ว กรุณาลบเอกสารปลายทางก่อน');
    }

    setSaving(true);
    const { id, quotation_items, created_at, ...headerFields } = selectedDoc;

    if (documentLogoFile) {
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(`document-logos/${id}`, documentLogoFile, {
          cacheControl: '0',
          contentType: documentLogoFile.type,
          upsert: true
        });

      if (uploadError) {
        alert('อัปโหลดโลโก้เอกสารไม่สำเร็จ: ' + getLogoUploadErrorMessage(uploadError));
        setSaving(false);
        return;
      }

      const { data } = supabase.storage.from('company-assets').getPublicUrl(`document-logos/${id}`);
      headerFields.logo_url = `${data.publicUrl}?v=${Date.now()}`;
    }

    const { error: headerErr } = await supabase.from('quotations').update(headerFields).eq('id', id);
    if (headerErr) {
      alert('บันทึกไม่สำเร็จ: ' + headerErr.message);
      setSaving(false);
      return;
    }

    const { error: deleteItemsError } = await supabase.from('quotation_items').delete().eq('quotation_id', id);
    if (deleteItemsError) {
      alert('บันทึกรายการสินค้าไม่สำเร็จ: ' + deleteItemsError.message);
      setSaving(false);
      return;
    }
    const itemsToInsert = quotation_items.map(({ id: itemId, ...rest }) => ({ ...rest, quotation_id: id }));
    if (itemsToInsert.length > 0) {
      const { error: insertItemsError } = await supabase.from('quotation_items').insert(itemsToInsert);
      if (insertItemsError) {
        alert('บันทึกรายการสินค้าไม่สำเร็จ: ' + insertItemsError.message);
        setSaving(false);
        return;
      }
    }

    await fetchAllData();
    setSelectedDoc({ ...selectedDoc, ...headerFields });
    setDocumentLogoFile(null);
    setDocumentLogoPreview(null);
    setSaving(false);
    setIsEditing(false);
    alert('บันทึกข้อมูลเรียบร้อยแล้ว!');
  };

  // ลบเอกสาร
  const handleDeleteDocument = async (id, docNo) => {
    const hasChildDocuments = documents.some(doc => String(doc.source_document_id) === String(id));
    if (hasChildDocuments) {
      return alert(`ลบ ${docNo} ไม่ได้ เนื่องจากมีเอกสารที่ออกต่อจากรายการนี้ กรุณาลบเอกสารปลายทางก่อน`);
    }
    if (!window.confirm(`ยืนยันการลบเอกสาร ${docNo} ?`)) return;
    const { error } = await supabase.from('quotations').delete().eq('id', id);
    if (error) return alert('ลบเอกสารไม่สำเร็จ: ' + error.message);
    setDocuments(documents.filter(d => d.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
  };

  const getStatusLabel = (doc) => {
    if (doc.status === 'draft') return 'แบบร่าง';
    if (doc.status === 'approved') {
      if (doc.doc_type === 'quotation' || !doc.doc_type) return 'ลูกค้าอนุมัติ';
      if (doc.doc_type === 'invoice') return 'ชำระเงินแล้ว';
      return 'ออกใบเสร็จแล้ว';
    }
    if (doc.status === 'pending') {
      if (doc.doc_type === 'quotation' || !doc.doc_type) return 'รอลูกค้าอนุมัติ';
      if (doc.doc_type === 'invoice') return 'รอชำระเงิน';
      return 'รอออกใบเสร็จ';
    }
    return doc.status;
  };

  const getStatusOptions = (doc) => {
    const options = [
      { value: 'draft', label: 'แบบร่าง' },
      {
        value: 'pending',
        label: doc.doc_type === 'invoice' ? 'รอชำระเงิน' : doc.doc_type === 'receipt' ? 'รอออกใบเสร็จ' : 'รอลูกค้าอนุมัติ'
      }
    ];
    if (doc.doc_type === 'quotation' || !doc.doc_type) {
      options.push({ value: 'approved', label: 'ลูกค้าอนุมัติ' });
    } else if (doc.doc_type === 'invoice') {
      options.push({ value: 'approved', label: 'ชำระเงินแล้ว' });
    } else {
      options.push({ value: 'approved', label: 'ออกใบเสร็จแล้ว' });
    }
    return options;
  };

  // เพิ่มลูกค้าใหม่
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name) return;
    const { data, error } = await supabase.from('customers').insert([newCustomer]).select().single();
    if (error) return alert('เพิ่มลูกค้าไม่สำเร็จ: ' + error.message);
    setCustomers(currentCustomers => [data, ...currentCustomers]);
    setNewCustomer({ name: '', tax_id: '', address: '', phone: '' });
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer?.name.trim()) return alert('กรุณาระบุชื่อลูกค้า');

    const { id, ...customerFields } = editingCustomer;
    const { data, error } = await supabase
      .from('customers')
      .update(customerFields)
      .eq('id', id)
      .select()
      .single();

    if (error) return alert('บันทึกข้อมูลลูกค้าไม่สำเร็จ: ' + error.message);
    setCustomers(currentCustomers => currentCustomers.map(customer => customer.id === id ? data : customer));
    setEditingCustomer(null);
  };

  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`ยืนยันการลบข้อมูลลูกค้า "${customer.name}" หรือไม่?`)) return;

    const { error } = await supabase.from('customers').delete().eq('id', customer.id);
    if (error) return alert('ลบข้อมูลลูกค้าไม่สำเร็จ: ' + error.message);
    setCustomers(currentCustomers => currentCustomers.filter(item => item.id !== customer.id));
    if (editingCustomer?.id === customer.id) setEditingCustomer(null);
  };

  // เพิ่มสินค้า/บริการใหม่
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name) return;
    const { data, error } = await supabase.from('products').insert([newProduct]).select().single();
    if (!error && data) {
      setProducts([data, ...products]);
      setNewProduct({ name: '', description: '', unit: 'งาน', unit_price: 0 });
    }
  };

  // บันทึกตั้งค่าบริษัท
  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setSaving(true);

    let logoUrl = company.logo_url || null;
    if (companyLogoFile) {
      const logoPath = 'company-logo/current';
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(logoPath, companyLogoFile, {
          cacheControl: '0',
          contentType: companyLogoFile.type,
          upsert: true
        });

      if (uploadError) {
        alert('อัปโหลดโลโก้ไม่สำเร็จ: ' + getLogoUploadErrorMessage(uploadError));
        setSaving(false);
        return;
      }

      const { data } = supabase.storage.from('company-assets').getPublicUrl(logoPath);
      logoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const updatedCompany = { ...company, logo_url: logoUrl };
    const { error } = await supabase.from('company_settings').upsert({ id: 1, ...updatedCompany });
    if (error) {
      alert('บันทึกข้อมูลบริษัทไม่สำเร็จ: ' + error.message);
      setSaving(false);
      return;
    }

    setCompany(updatedCompany);
    setCompanyLogoFile(null);
    setCompanyLogoPreview(null);
    setSaving(false);
    alert('บันทึกข้อมูลบริษัทเรียบร้อยแล้ว!');
  };

  const handleCompanyLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('เลือกไฟล์ภาพ PNG, JPG หรือ WEBP เท่านั้น');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์โลโก้ต้องไม่เกิน 5 MB');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCompanyLogoFile(file);
      setCompanyLogoPreview(String(reader.result));
    };
    reader.onerror = () => alert('อ่านไฟล์ภาพไม่สำเร็จ กรุณาลองเลือกไฟล์อีกครั้ง');
    reader.readAsDataURL(file);
  };

  const handleDocumentLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('เลือกไฟล์ภาพ PNG, JPG หรือ WEBP เท่านั้น');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์โลโก้ต้องไม่เกิน 5 MB');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDocumentLogoFile(file);
      setDocumentLogoPreview(String(reader.result));
    };
    reader.onerror = () => alert('อ่านไฟล์ภาพไม่สำเร็จ กรุณาลองเลือกไฟล์อีกครั้ง');
    reader.readAsDataURL(file);
  };

  const handleUseCompanyLogo = () => {
    setDocumentLogoFile(null);
    setDocumentLogoPreview(null);
    setSelectedDoc({ ...selectedDoc, logo_url: null });
  };

  const handleCloseDocument = () => {
    setSelectedDoc(null);
    setDocumentLogoFile(null);
    setDocumentLogoPreview(null);
  };

  const handleResetCompanyLogo = () => {
    setCompanyLogoFile(null);
    setCompanyLogoPreview(null);
    setCompany({ ...company, logo_url: null });
  };

  // กรองเอกสารตามเมนูที่เลือก
  const currentTypeDocs = documents.filter(d => (d.doc_type || 'quotation') === activeMenu);
  const filteredDocs = currentTypeDocs.filter(doc => {
    const matchSearch =
      doc.doc_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ชื่อหัวกระดาษ A4 ตามประเภทเอกสาร
  const getDocTitles = (type) => {
    if (type === 'invoice') return { th: 'ใบแจ้งหนี้ / ใบวางบิล', en: 'INVOICE' };
    if (type === 'receipt') return { th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE' };
    return { th: 'ใบเสนอราคา', en: 'QUOTATION' };
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col no-print shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Company DocHub</h1>
            <p className="text-xs text-emerald-400">● Supabase Online</p>
          </div>
        </div>

        <nav className="p-4 space-y-6 flex-1 overflow-y-auto">
          {/* กลุ่ม 1: ภาพรวม */}
          <div>
            <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ภาพรวมระบบ</div>
            <button
              onClick={() => setActiveMenu('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition ${
                activeMenu === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" /> แดชบอร์ดสรุปยอด
            </button>
          </div>

          {/* กลุ่ม 2: เอกสารขายและบัญชี */}
          <div>
            <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">เอกสารขายและบัญชี</div>
            <div className="space-y-1">
              {[
                { id: 'quotation', label: 'ใบเสนอราคา (QT)', icon: FileText },
                { id: 'invoice', label: 'ใบแจ้งหนี้ (INV)', icon: FileSpreadsheet },
                { id: 'receipt', label: 'ใบเสร็จรับเงิน (REC)', icon: Receipt },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveMenu(item.id); setStatusFilter('all'); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition ${
                      activeMenu === item.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* กลุ่ม 3: ฐานข้อมูลและตั้งค่า */}
          <div>
            <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ฐานข้อมูล & ตั้งค่า</div>
            <div className="space-y-1">
              {[
                { id: 'customers', label: 'ฐานข้อมูลลูกค้า', icon: Users },
                { id: 'products', label: 'คลังสินค้า / บริการ', icon: Package },
                { id: 'settings', label: 'ตั้งค่าข้อมูลบริษัท', icon: Settings },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveMenu(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition ${
                      activeMenu === item.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 no-print overflow-y-auto">
        {/* ================= 1. หน้า DASHBOARD ================= */}
        {activeMenu === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">ภาพรวมธุรกิจ (Dashboard)</h2>
                <p className="text-slate-500 text-sm">สรุปมูลค่าเอกสารทั้งหมดในระบบแบบเรียลไทม์</p>
              </div>
              <button onClick={fetchAllData} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> อัปเดตข้อมูล
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  title: 'ยอดใบเสนอราคาทั้งหมด',
                  value: documents.filter(d => (d.doc_type || 'quotation') === 'quotation').reduce((s, d) => s + calculateTotals(d).grandTotal, 0),
                  count: documents.filter(d => (d.doc_type || 'quotation') === 'quotation').length + ' ฉบับ',
                  color: 'text-blue-600 bg-blue-50'
                },
                {
                  title: 'ยอดวางบิล / ใบแจ้งหนี้',
                  value: documents.filter(d => d.doc_type === 'invoice').reduce((s, d) => s + calculateTotals(d).grandTotal, 0),
                  count: documents.filter(d => d.doc_type === 'invoice').length + ' ฉบับ',
                  color: 'text-amber-600 bg-amber-50'
                },
                {
                  title: 'รายรับจริง (ใบเสร็จรับเงิน)',
                  value: documents.filter(d => d.doc_type === 'receipt').reduce((s, d) => s + calculateTotals(d).grandTotal, 0),
                  count: documents.filter(d => d.doc_type === 'receipt').length + ' ฉบับ',
                  color: 'text-emerald-600 bg-emerald-50'
                },
                {
                  title: 'ฐานข้อมูลลูกค้าในระบบ',
                  value: null,
                  customText: `${customers.length} บริษัท`,
                  count: `${products.length} รายการสินค้า/บริการ`,
                  color: 'text-purple-600 bg-purple-50'
                }
              ].map((kpi, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-sm font-medium text-slate-500">{kpi.title}</div>
                  <div className="text-2xl font-bold text-slate-900 mt-2">
                    {kpi.value !== null ? `฿${kpi.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : kpi.customText}
                  </div>
                  <div className={`inline-block mt-3 px-2.5 py-1 rounded-lg text-xs font-semibold ${kpi.color}`}>
                    {kpi.count}
                  </div>
                </div>
              ))}
            </div>

            {/* เอกสารล่าสุด */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4">เอกสารล่าสุดในระบบ</h3>
              <div className="divide-y divide-slate-100">
                {documents.slice(0, 5).map(doc => (
                  <div key={doc.id} className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-blue-600 mr-3">{doc.doc_no}</span>
                      <span className="font-medium text-slate-800">{doc.customer_name}</span>
                      <span className="text-xs text-slate-400 ml-2">({doc.project_title})</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">฿{calculateTotals(doc).grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                      <button
                        onClick={() => { setSelectedDoc(doc); setIsEditing(false); }}
                        className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        เปิดดู A4
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. หน้าจัดการเอกสาร (QT / INV / REC) ================= */}
        {['quotation', 'invoice', 'receipt'].includes(activeMenu) && (
          <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {activeMenu === 'quotation' ? 'รวมใบเสนอราคา (Quotations)' :
                   activeMenu === 'invoice' ? 'รวมใบแจ้งหนี้ / ใบวางบิล (Invoices)' :
                   'รวมใบเสร็จรับเงิน / ใบกำกับภาษี (Receipts)'}
                </h2>
                <p className="text-slate-500 text-sm">สร้าง แก้ไข สั่งพิมพ์ PDF และส่งต่อเอกสารข้ามขั้นตอน</p>
              </div>
              <button
                onClick={() => handleCreateDocument(activeMenu)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm"
              >
                <Plus className="w-5 h-5" />
                สร้าง{activeMenu === 'quotation' ? 'ใบเสนอราคา' : activeMenu === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน'}ใหม่
              </button>
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
                  { id: 'pending', label: activeMenu === 'invoice' ? 'รอชำระเงิน' : activeMenu === 'quotation' ? 'รอลูกค้าอนุมัติ' : 'รอออกใบเสร็จ' },
                  { id: 'approved', label: activeMenu === 'quotation' ? 'ลูกค้าอนุมัติ' : activeMenu === 'invoice' ? 'ชำระเงินแล้ว' : 'ออกใบเสร็จแล้ว' },
                  { id: 'draft', label: 'แบบร่าง' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                      statusFilter === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                  {filteredDocs.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-12 text-slate-400">ยังไม่มีเอกสารในหมวดนี้ กดปุ่มสร้างใหม่ด้านบนได้เลยครับ</td></tr>
                  ) : (
                    filteredDocs.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/80">
                        <td className="py-4 px-6 font-semibold text-blue-600">{doc.doc_no}</td>
                        <td className="py-4 px-6">
                          <div className="font-medium text-slate-900">{doc.customer_name}</div>
                          <div className="text-xs text-slate-500">{doc.project_title}</div>
                          {doc.source_document_id && (
                            <div className="text-xs text-blue-600">
                              อ้างอิง {documents.find(source => String(source.id) === String(doc.source_document_id))?.doc_no || 'เอกสารต้นทาง'}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600">{doc.issue_date}</td>
                        <td className="py-4 px-6 text-right font-semibold text-slate-900">
                          ฿{calculateTotals(doc).grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                            doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            doc.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {doc.status === 'approved' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {getStatusLabel(doc)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2">
                          {activeMenu === 'quotation' && (
                            <button
                              onClick={() => handleConvertDocument(doc, 'invoice')}
                              disabled={doc.status !== 'approved' || documents.some(item => item.doc_type === 'invoice' && String(item.source_document_id) === String(doc.id))}
                              title={doc.status !== 'approved' ? 'ต้องได้รับอนุมัติจากลูกค้าก่อน' : 'ส่งต่อเป็นใบแจ้งหนี้'}
                              className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium inline-flex items-center gap-1"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" /> ออกใบแจ้งหนี้
                            </button>
                          )}
                          {activeMenu === 'invoice' && (
                            <button
                              onClick={() => handleConvertDocument(doc, 'receipt')}
                              disabled={doc.status !== 'approved' || documents.some(item => item.doc_type === 'receipt' && String(item.source_document_id) === String(doc.id))}
                              title={doc.status !== 'approved' ? 'ต้องบันทึกสถานะชำระเงินก่อน' : 'ออกใบเสร็จรับเงิน'}
                              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium inline-flex items-center gap-1"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" /> ออกใบเสร็จ
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedDoc(doc); setIsEditing(true); }}
                            className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> แก้ไข / พิมพ์
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.id, doc.doc_no)}
                            className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> ลบ
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= 3. หน้าฐานข้อมูลลูกค้า ================= */}
        {activeMenu === 'customers' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">ฐานข้อมูลลูกค้า (Customers)</h2>
            <form onSubmit={handleAddCustomer} className="bg-white p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
              <input required placeholder="ชื่อบริษัท / ลูกค้า *" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} className="border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <input placeholder="เลขประจำตัวผู้เสียภาษี" value={newCustomer.tax_id} onChange={e => setNewCustomer({ ...newCustomer, tax_id: e.target.value })} className="border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <input placeholder="เบอร์โทรศัพท์" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <button type="submit" className="bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700">+ เพิ่มรายชื่อลูกค้า</button>
              <input placeholder="ที่อยู่สำหรับออกใบกำกับภาษี" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} className="md:col-span-4 border border-slate-200 px-3 py-2 rounded-xl text-sm" />
            </form>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-6">ชื่อบริษัทลูกค้า</th>
                    <th className="py-3 px-6">เลขผู้เสียภาษี</th>
                    <th className="py-3 px-6">ที่อยู่</th>
                    <th className="py-3 px-6 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map(c => editingCustomer?.id === c.id ? (
                    <tr key={c.id}>
                      <td colSpan="4" className="p-3">
                        <form onSubmit={handleSaveCustomer} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <input
                            required
                            aria-label="ชื่อบริษัทลูกค้า"
                            value={editingCustomer.name}
                            onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                            className="border border-slate-200 px-3 py-2 rounded-xl text-sm"
                          />
                          <input
                            aria-label="เลขประจำตัวผู้เสียภาษี"
                            value={editingCustomer.tax_id || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, tax_id: e.target.value })}
                            className="border border-slate-200 px-3 py-2 rounded-xl text-sm"
                          />
                          <input
                            aria-label="เบอร์โทรศัพท์"
                            value={editingCustomer.phone || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                            className="border border-slate-200 px-3 py-2 rounded-xl text-sm"
                          />
                          <input
                            aria-label="ที่อยู่"
                            value={editingCustomer.address || ''}
                            onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                            className="border border-slate-200 px-3 py-2 rounded-xl text-sm"
                          />
                          <div className="flex justify-end gap-3">
                            <button type="submit" className="text-emerald-600 hover:underline">บันทึก</button>
                            <button type="button" onClick={() => setEditingCustomer(null)} className="text-slate-500 hover:underline">ยกเลิก</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td className="py-3 px-6 font-semibold">{c.name}</td>
                      <td className="py-3 px-6">{c.tax_id}</td>
                      <td className="py-3 px-6 text-slate-500">{c.address}</td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <button onClick={() => setEditingCustomer({ ...c })} className="text-blue-600 hover:underline mr-4">แก้ไข</button>
                        <button onClick={() => handleDeleteCustomer(c)} className="text-red-500 hover:underline">ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= 4. หน้าคลังสินค้า / บริการ ================= */}
        {activeMenu === 'products' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">คลังสินค้าและบริการ (Products & Services)</h2>
            <form onSubmit={handleAddProduct} className="bg-white p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-4">
              <input required placeholder="ชื่อสินค้า / บริการ *" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} className="md:col-span-2 border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <input placeholder="หน่วย (เช่น งาน, เครื่อง)" value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} className="border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <input type="number" placeholder="ราคา/หน่วย" value={newProduct.unit_price} onChange={e => setNewProduct({ ...newProduct, unit_price: Number(e.target.value) })} className="border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              <button type="submit" className="bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700">+ เพิ่มรายการ</button>
              <input placeholder="รายละเอียดเพิ่มเติม (แสดงใต้ชื่อรายการ)" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} className="md:col-span-5 border border-slate-200 px-3 py-2 rounded-xl text-sm" />
            </form>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-6">รายการสินค้า / บริการ</th>
                    <th className="py-3 px-6">หน่วย</th>
                    <th className="py-3 px-6 text-right">ราคามาตรฐาน</th>
                    <th className="py-3 px-6 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map(p => (
                    <tr key={p.id}>
                      <td className="py-3 px-6">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-slate-400">{p.description}</div>
                      </td>
                      <td className="py-3 px-6">{p.unit}</td>
                      <td className="py-3 px-6 text-right font-semibold">฿{Number(p.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-6 text-right">
                        <button onClick={async () => { await supabase.from('products').delete().eq('id', p.id); setProducts(products.filter(x => x.id !== p.id)); }} className="text-red-500 hover:underline">ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= 5. หน้าตั้งค่าข้อมูลบริษัท ================= */}
        {activeMenu === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">ตั้งค่าข้อมูลบริษัท (หัวกระดาษ A4)</h2>
            <form onSubmit={handleSaveCompany} className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อบริษัท (ภาษาไทย / อังกฤษ)</label>
                <input value={company.company_name} onChange={e => setCompany({ ...company, company_name: e.target.value })} className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">โลโก้บริษัท</label>
                <div className="flex items-center gap-4">
                  <img
                    src={companyLogoPreview || company.logo_url || speedyPackageExpressLogo}
                    alt="ตัวอย่างโลโก้บริษัท"
                    className="w-20 h-20 object-contain rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleCompanyLogoChange}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-slate-500">รองรับ PNG, JPG, WEBP ขนาดไม่เกิน 5 MB</p>
                    <button
                      type="button"
                      onClick={handleResetCompanyLogo}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      ใช้โลโก้เริ่มต้น
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input value={company.tax_id} onChange={e => setCompany({ ...company, tax_id: e.target.value })} className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์ติดต่อ</label>
                  <input value={company.phone} onChange={e => setCompany({ ...company, phone: e.target.value })} className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ที่อยู่สำนักงานใหญ่</label>
                <textarea rows="2" value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })} className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ข้อมูลบัญชีธนาคารสำหรับรับชำระเงิน (แสดงท้ายกระดาษ)</label>
                <textarea rows="2" value={company.bank_info || ''} onChange={e => setCompany({ ...company, bank_info: e.target.value })} className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm" />
              </div>
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700">
                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าบริษัท'}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* ================= MODAL กระดาษ A4 แก้ไขได้ + สั่งพิมพ์ ================= */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 overflow-y-auto flex flex-col items-center py-6 px-4">
          <div className="w-full max-w-[210mm] bg-slate-800 text-white px-6 py-3.5 rounded-t-2xl flex flex-wrap justify-between items-center gap-3 no-print">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{selectedDoc.doc_no}</span>
              <select
                value={selectedDoc.status}
                onChange={(e) => setSelectedDoc({ ...selectedDoc, status: e.target.value })}
                className="bg-slate-700 text-sm rounded-lg px-3 py-1.5 border border-slate-600"
              >
                {getStatusOptions(selectedDoc).map(option => (
                  <option key={option.value} value={option.value}>สถานะ: {option.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${
                  isEditing ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-white'
                }`}
              >
                <Edit3 className="w-4 h-4" /> {isEditing ? 'กำลังแก้ไข' : 'แก้ไขเอกสาร'}
              </button>
              <button onClick={handleSaveDocument} disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5">
                <Save className="w-4 h-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5">
                <Printer className="w-4 h-4" /> พิมพ์ / PDF
              </button>
              <button onClick={handleCloseDocument} className="p-2 hover:bg-slate-700 rounded-xl text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div id="printable-a4" className="w-full max-w-[210mm] min-h-[297mm] bg-white p-12 shadow-2xl text-slate-800">
            {/* หัวกระดาษดึงจาก company_settings */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{company.company_name}</h2>
                <p className="text-xs text-slate-500 mt-1">{company.address}</p>
                <p className="text-xs text-slate-500">เลขประจำตัวผู้เสียภาษี: {company.tax_id} | โทร: {company.phone}</p>
              </div>
              <div className="flex flex-col items-end text-right">
                <img
                  src={documentLogoPreview || selectedDoc.logo_url || company.logo_url || speedyPackageExpressLogo}
                  alt="โลโก้บริษัท Speedy Package Express"
                  className="w-20 h-20 object-contain mb-3"
                />
                {isEditing && (
                  <div className="no-print mb-3 flex flex-col items-end gap-1">
                    <label className="cursor-pointer rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      เปลี่ยนโลโก้เอกสาร
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleDocumentLogoChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleUseCompanyLogo}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      ใช้โลโก้บริษัท
                    </button>
                  </div>
                )}
                <h1 className="text-2xl font-bold text-blue-700 tracking-wide">{getDocTitles(selectedDoc.doc_type).th}</h1>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{getDocTitles(selectedDoc.doc_type).en}</p>
                <div className="mt-2 text-sm"><span className="text-slate-500">เลขที่: </span><span className="font-bold">{selectedDoc.doc_no}</span></div>
                <div className="text-sm"><span className="text-slate-500">วันที่: </span><span>{selectedDoc.issue_date}</span></div>
              </div>
            </div>

            {/* ข้อมูลลูกค้า + ตัวเลือกดึงจากฐานข้อมูลลูกค้า */}
            <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xs font-bold text-slate-400 uppercase">ข้อมูลลูกค้า (Customer)</div>
                {isEditing && customers.length > 0 && (
                  <select
                    onChange={(e) => {
                      const found = customers.find(c => c.id === e.target.value);
                      if (found) {
                        setSelectedDoc({
                          ...selectedDoc,
                          customer_name: found.name,
                          customer_tax_id: found.tax_id || '',
                          customer_address: found.address || ''
                        });
                      }
                    }}
                    className="text-xs border border-blue-300 bg-blue-50 text-blue-800 rounded px-2 py-1 no-print"
                  >
                    <option value="">-- เลือกลูกค้าจากฐานข้อมูล --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>

              {isEditing ? (
                <div className="grid grid-cols-2 gap-3">
                  <input value={selectedDoc.customer_name} onChange={e => setSelectedDoc({ ...selectedDoc, customer_name: e.target.value })} placeholder="ชื่อบริษัทลูกค้า" className="border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm font-semibold" />
                  <input value={selectedDoc.customer_tax_id || ''} onChange={e => setSelectedDoc({ ...selectedDoc, customer_tax_id: e.target.value })} placeholder="เลขผู้เสียภาษี" className="border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm" />
                  <input value={selectedDoc.customer_address || ''} onChange={e => setSelectedDoc({ ...selectedDoc, customer_address: e.target.value })} placeholder="ที่อยู่ลูกค้า" className="col-span-2 border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm" />
                  <input value={selectedDoc.project_title} onChange={e => setSelectedDoc({ ...selectedDoc, project_title: e.target.value })} placeholder="ชื่อโครงการ" className="col-span-2 border border-amber-300 bg-amber-50/40 px-3 py-1.5 rounded text-sm font-medium" />
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
            <table className="w-full text-sm border-collapse mb-4">
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
                            <input value={item.item_name} onChange={e => { const u = [...selectedDoc.quotation_items]; u[idx].item_name = e.target.value; setSelectedDoc({ ...selectedDoc, quotation_items: u }); }} className="w-full border border-amber-300 bg-amber-50/40 px-2 py-1 rounded font-medium" />
                            <input value={item.description || ''} onChange={e => { const u = [...selectedDoc.quotation_items]; u[idx].description = e.target.value; setSelectedDoc({ ...selectedDoc, quotation_items: u }); }} placeholder="รายละเอียดเพิ่มเติม" className="w-full border border-amber-200 px-2 py-0.5 rounded text-xs text-slate-500" />
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-slate-900">{item.item_name}</div>
                            {item.description && <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isEditing ? <input type="number" value={item.quantity} onChange={e => { const u = [...selectedDoc.quotation_items]; u[idx].quantity = Number(e.target.value); setSelectedDoc({ ...selectedDoc, quotation_items: u }); }} className="w-16 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-right" /> : item.quantity}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isEditing ? <input value={item.unit} onChange={e => { const u = [...selectedDoc.quotation_items]; u[idx].unit = e.target.value; setSelectedDoc({ ...selectedDoc, quotation_items: u }); }} className="w-16 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-center" /> : item.unit}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isEditing ? <input type="number" value={item.unit_price} onChange={e => { const u = [...selectedDoc.quotation_items]; u[idx].unit_price = Number(e.target.value); setSelectedDoc({ ...selectedDoc, quotation_items: u }); }} className="w-24 border border-amber-300 bg-amber-50/40 px-1.5 py-1 rounded text-right" /> : Number(item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">{lineTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      {isEditing && (
                        <td className="py-3 px-2 text-center no-print">
                          <button onClick={() => setSelectedDoc({ ...selectedDoc, quotation_items: selectedDoc.quotation_items.filter((_, i) => i !== idx) })} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ปุ่มเพิ่มรายการ (พิมพ์เอง หรือเลือกจากคลังสินค้า) */}
            {isEditing && (
              <div className="flex flex-wrap gap-2 mb-6 no-print">
                <button
                  onClick={() => setSelectedDoc({
                    ...selectedDoc,
                    quotation_items: [...(selectedDoc.quotation_items || []), { item_name: 'รายการใหม่', description: '', quantity: 1, unit: 'รายการ', unit_price: 0, discount: 0 }]
                  })}
                  className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-200"
                >
                  + เพิ่มรายการเปล่า
                </button>
                {products.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const prod = products.find(p => p.id === e.target.value);
                      if (prod) {
                        setSelectedDoc({
                          ...selectedDoc,
                          quotation_items: [
                            ...(selectedDoc.quotation_items || []),
                            { item_name: prod.name, description: prod.description || '', quantity: 1, unit: prod.unit, unit_price: Number(prod.unit_price), discount: 0 }
                          ]
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="">+ เลือกเพิ่มจากคลังสินค้า/บริการ...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (฿{Number(p.unit_price).toLocaleString()})</option>)}
                  </select>
                )}
              </div>
            )}

            {/* สรุปยอดเงินและบัญชีธนาคาร */}
            {(() => {
              const { subtotal, discountAmount, vatAmount, whtAmount, grandTotal } = calculateTotals(selectedDoc);
              return (
                <div className="flex justify-between items-start gap-8">
                  <div className="flex-1 text-xs text-slate-600 space-y-3">
                    <div>
                      <div className="font-bold text-slate-700 mb-1">หมายเหตุ / เงื่อนไข:</div>
                      {isEditing ? (
                        <textarea rows="3" value={selectedDoc.notes || ''} onChange={e => setSelectedDoc({ ...selectedDoc, notes: e.target.value })} className="w-full border border-amber-300 bg-amber-50/40 p-2 rounded" />
                      ) : (
                        <p className="whitespace-pre-line">{selectedDoc.notes}</p>
                      )}
                    </div>
                    {company.bank_info && (
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="font-bold text-slate-700">ช่องทางการชำระเงิน:</div>
                        <p className="whitespace-pre-line mt-0.5">{company.bank_info}</p>
                      </div>
                    )}
                  </div>

                  <div className="w-72 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-slate-500">รวมเป็นเงิน</span><span>{subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">ส่วนลด {isEditing && <input type="number" value={selectedDoc.discount_percent} onChange={e => setSelectedDoc({ ...selectedDoc, discount_percent: Number(e.target.value) })} className="w-12 border border-amber-300 px-1 rounded text-right ml-1" />}%</span>
                      <span className="text-red-600">-{discountAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-slate-500 flex items-center gap-1.5">
                        {isEditing && <input type="checkbox" checked={selectedDoc.vat_enabled} onChange={e => setSelectedDoc({ ...selectedDoc, vat_enabled: e.target.checked })} />}
                        ภาษีมูลค่าเพิ่ม 7%
                      </label>
                      <span>{vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">หัก ณ ที่จ่าย {isEditing ? (
                        <select value={selectedDoc.wht_percent} onChange={e => setSelectedDoc({ ...selectedDoc, wht_percent: Number(e.target.value) })} className="border border-amber-300 rounded px-1 ml-1">
                          <option value={0}>0%</option><option value={1}>1%</option><option value={3}>3%</option><option value={5}>5%</option>
                        </select>
                      ) : `${selectedDoc.wht_percent}%`}</span>
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