import React from 'react';
import { Search, BookOpen, Trash2 } from 'lucide-react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface Doc {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  createdAt?: string;
}

interface DocumentListProps {
  documents: Doc[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onDelete: (id: string) => void;
  onQueryAI: () => void;
  isLoading: boolean;
  activeTab: string;
}

export function DocumentList({ 
  documents, 
  searchTerm, 
  setSearchTerm, 
  onDelete, 
  onQueryAI, 
  isLoading, 
  activeTab 
}: DocumentListProps) {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onQueryAI();
    }
  };

  return (
    <div className={`${
      activeTab === 'documents' ? 'flex' : 'hidden'
    } lg:flex flex-col w-full lg:w-2/5 bg-white border-l border-gray-200`}>
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="جستجو در اسناد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 space-y-3">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="mx-auto text-gray-300" size={48} />
            <p className="mt-4 text-gray-500">
              {documents.length === 0 
                ? 'هنوز سندی اضافه نشده است'
                : 'نتیجه‌ای یافت نشد'}
            </p>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }: { height: number; width: number }) => (
              <List
                height={height}
                width={width}
                itemCount={documents.length}
                itemSize={140} // Approximate height of a card
              >
                {({ index, style }: { index: number; style: React.CSSProperties }) => {
                  const doc = documents[index];
                  return (
                    <div style={style} className="p-1">
                      <div className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-200 h-full">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-gray-800 truncate pr-2">{doc.title}</h3>
                          <button
                            onClick={() => onDelete(doc.id)}
                            className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0"
                            title="Delete document"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2 h-10">{doc.content}</p>
                        <div className="flex items-center justify-between text-xs mt-auto">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full truncate max-w-[120px]">
                            {doc.category}
                          </span>
                          <span className="text-gray-400 flex-shrink-0">
                            {doc.createdAt
                              ? new Date(doc.createdAt).toLocaleDateString('fa-IR')
                              : 'نامشخص'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </List>
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
}
