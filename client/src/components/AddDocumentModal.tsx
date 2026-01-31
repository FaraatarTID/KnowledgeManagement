import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from './ToastContainer';

interface AddDocumentModalProps {
  onClose: () => void;
  onAdd: (doc: { title: string; content: string; category: string }) => void;
}

export function AddDocumentModal({ onClose, onAdd }: AddDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = () => {
    if (!title.trim() || !content.trim() || !category.trim()) {
      toast.error('Please fill all fields');
      return;
    }

    onAdd({ title, content, category });
    setTitle('');
    setContent('');
    setCategory('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e as React.KeyboardEvent).ctrlKey) {
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">افزودن سند جدید</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">عنوان سند</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: راهنمای استفاده از سیستم"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">دسته‌بندی</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: فنی، اداری، آموزشی"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">محتوای سند</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="محتوای کامل سند را اینجا وارد کنید..."
            />
            <p className="text-xs text-gray-500 mt-1">Ctrl+Enter برای ذخیره سریع</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSubmit}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all font-medium"
            >
              ذخیره سند
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              انصراف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
