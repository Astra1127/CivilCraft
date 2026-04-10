import { useState } from 'react';
import {
  Star, Clock, Send, MessageSquare, Filter,
  ChevronDown, Search, TrendingUp, Award, ThumbsUp
} from 'lucide-react';
import BlueprintCard from '../components/BlueprintCard';
import { useAuth } from '../context/AuthContext';

interface FeedbackItem {
  id: number;
  user: string;
  email: string;
  role: 'student' | 'professor';
  rating: number;
  category: string;
  comment: string;
  date: string;
  section?: string;
  helpful: number;
}

const allFeedback: FeedbackItem[] = [
  {
    id: 1, user: 'Emily Davis', email: 'emily@students.civilcraft.edu', role: 'student',
    rating: 5, category: 'Gameplay', section: 'CE-101',
    comment: 'The suspension bridge challenge was incredibly engaging! The physics simulation really helped me understand load distribution in a practical way. I could visualize how forces flow through the truss members.',
    date: '2 hours ago', helpful: 12
  },
  {
    id: 2, user: 'John Doe', email: 'john@students.civilcraft.edu', role: 'student',
    rating: 4, category: 'Content', section: 'CE-101',
    comment: 'Good content overall. The structural analysis modules are well-designed, but I would love more interactive 3D models for foundation design. The scoring criteria could also be more transparent.',
    date: '5 hours ago', helpful: 8
  },
  {
    id: 3, user: 'Prof. Rivera', email: 'rivera@edu.ph', role: 'professor',
    rating: 5, category: 'Platform', section: 'CE-101',
    comment: 'The analytics dashboard gives me excellent insight into student performance. I can track which concepts students struggle with and adjust my lectures accordingly. The section management tools are very intuitive.',
    date: '1 day ago', helpful: 15
  },
  {
    id: 4, user: 'Sarah Wilson', email: 'sarah@students.civilcraft.edu', role: 'student',
    rating: 5, category: 'Gameplay', section: 'CE-202',
    comment: 'The scoring system really motivates me to improve my designs. I keep trying to optimize my bridges for both stability and cost efficiency. Love the competitive leaderboard!',
    date: '1 day ago', helpful: 10
  },
  {
    id: 5, user: 'Michael Brown', email: 'michael@students.civilcraft.edu', role: 'student',
    rating: 3, category: 'Difficulty', section: 'CE-101',
    comment: 'Some of the load calculations feel too simplified compared to what we study in class. Would appreciate more complexity options and advanced material properties. The budget constraints could also be more realistic.',
    date: '2 days ago', helpful: 6
  },
  {
    id: 6, user: 'Prof. Santos', email: 'santos@edu.ph', role: 'professor',
    rating: 4, category: 'Platform', section: 'CE-202',
    comment: 'Great tool for supplementing classroom instruction. The ability to assign specific challenges and review student submissions is very helpful. Would love a feature to create custom challenges aligned to my syllabus.',
    date: '3 days ago', helpful: 9
  },
  {
    id: 7, user: 'Lisa Chen', email: 'lisa@students.civilcraft.edu', role: 'student',
    rating: 5, category: 'Learning', section: 'CE-101',
    comment: 'I finally understand moment distribution after completing the truss design challenges! The visual feedback showing stress concentrations made abstract concepts click. Best learning tool I have used in engineering.',
    date: '3 days ago', helpful: 18
  },
  {
    id: 8, user: 'Carlos Reyes', email: 'carlos@students.civilcraft.edu', role: 'student',
    rating: 4, category: 'Gameplay', section: 'CE-202',
    comment: 'The canyon bridge level is awesome! Building across the gorge with limited materials really tests your engineering judgment. The low-poly art style is charming too.',
    date: '4 days ago', helpful: 7
  },
];

const categories = ['All', 'Gameplay', 'Content', 'Platform', 'Difficulty', 'Learning', 'Bug Report', 'Suggestion'];

export default function FeedbackPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [myFeedbackList, setMyFeedbackList] = useState<FeedbackItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('Gameplay');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Admin filters
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterRole, setFilterRole] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSubmit = () => {
    if (rating === 0 || comment.trim() === '') return;
    const newFeedback: FeedbackItem = {
      id: Date.now(),
      user: user?.name ?? 'Anonymous',
      email: user?.email ?? '',
      role: (user?.role as 'student' | 'professor') ?? 'student',
      rating,
      category,
      comment: comment.trim(),
      date: 'Just now',
      section: 'CE-101',
      helpful: 0,
    };
    setMyFeedbackList(prev => [newFeedback, ...prev]);
    setRating(0);
    setComment('');
    setCategory('Gameplay');
    setShowForm(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  // Combine demo + user feedback
  const combinedFeedback = [...myFeedbackList, ...allFeedback];

  // Filter for admin view
  const filteredFeedback = combinedFeedback.filter(f => {
    if (filterCategory !== 'All' && f.category !== filterCategory) return false;
    if (filterRole === 'Students' && f.role !== 'student') return false;
    if (filterRole === 'Professors' && f.role !== 'professor') return false;
    if (searchTerm && !f.user.toLowerCase().includes(searchTerm.toLowerCase()) && !f.comment.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Stats
  const avgRating = combinedFeedback.length > 0
    ? (combinedFeedback.reduce((s, f) => s + f.rating, 0) / combinedFeedback.length).toFixed(1)
    : '0.0';
  const totalReviews = combinedFeedback.length;
  const fiveStarCount = combinedFeedback.filter(f => f.rating === 5).length;
  const fiveStarPct = totalReviews > 0 ? Math.round((fiveStarCount / totalReviews) * 100) : 0;

  const renderStars = (count: number, size = 'w-3.5 h-3.5') => (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${size} ${i < count ? 'text-amber-500 fill-amber-500' : 'text-stone-300'}`} />
      ))}
    </div>
  );

  const renderFeedbackCard = (f: FeedbackItem) => (
    <BlueprintCard key={f.id} className="p-5 hover:border-earth-300/40 transition-all">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white font-mono">
              {f.user.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-earth-800">{f.user}</p>
              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                f.role === 'professor'
                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
              }`}>
                {f.role === 'professor' ? 'PROFESSOR' : 'STUDENT'}
              </span>
              {f.section && (
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-earth-100 text-earth-600 border border-earth-200">
                  {f.section}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {renderStars(f.rating)}
              <span className="text-[10px] font-mono text-stone-400">{f.rating}.0</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono font-semibold px-2 py-1 rounded bg-earth-50 text-earth-600 border border-earth-200/50">
            {f.category}
          </span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-stone-400" />
            <span className="text-[10px] font-mono text-stone-400">{f.date}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed sm:ml-[52px]">{f.comment}</p>
      <div className="flex items-center gap-2 mt-3 sm:ml-[52px]">
        <ThumbsUp className="w-3.5 h-3.5 text-stone-400" />
        <span className="text-[10px] font-mono text-stone-400">{f.helpful} found helpful</span>
      </div>
    </BlueprintCard>
  );

  // ─── ADMIN VIEW ───
  if (isAdmin) {
    return (
      <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BlueprintCard className="p-5">
            <p className="text-[11px] font-mono text-stone-400 tracking-widest uppercase">Average Rating</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-earth-800 font-mono">{avgRating}</p>
              {renderStars(Math.round(Number(avgRating)), 'w-4 h-4')}
            </div>
          </BlueprintCard>
          <BlueprintCard className="p-5">
            <p className="text-[11px] font-mono text-stone-400 tracking-widest uppercase">Total Reviews</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-earth-800 font-mono">{totalReviews}</p>
              <MessageSquare className="w-5 h-5 text-amber-500" />
            </div>
          </BlueprintCard>
          <BlueprintCard className="p-5">
            <p className="text-[11px] font-mono text-stone-400 tracking-widest uppercase">5-Star Reviews</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-amber-600 font-mono">{fiveStarPct}%</p>
              <Award className="w-5 h-5 text-amber-500" />
            </div>
          </BlueprintCard>
          <BlueprintCard className="p-5">
            <p className="text-[11px] font-mono text-stone-400 tracking-widest uppercase">Satisfaction</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-emerald-600 font-mono">High</p>
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
          </BlueprintCard>
        </div>

        {/* Rating Breakdown */}
        <BlueprintCard className="p-5">
          <h3 className="text-sm font-bold font-mono text-earth-800 tracking-wide uppercase mb-4">Rating Distribution</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(star => {
              const count = combinedFeedback.filter(f => f.rating === star).length;
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-16">
                    <span className="text-xs font-mono text-stone-500 w-4 text-right">{star}</span>
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  </div>
                  <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden border border-stone-200/50">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-stone-500 w-12 text-right">{count} ({Math.round(pct)}%)</span>
                </div>
              );
            })}
          </div>
        </BlueprintCard>

        {/* Filters */}
        <BlueprintCard className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-earth-600" />
              <h3 className="text-sm font-bold font-mono text-earth-800 tracking-wide uppercase">All Feedback</h3>
              <span className="text-[10px] font-mono text-stone-400">({filteredFeedback.length})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search feedback..."
                  className="pl-9 pr-3 py-2 text-xs font-mono bg-white border border-earth-200 rounded-lg focus:outline-none focus:border-amber-500 w-48"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-earth-700 bg-white border border-earth-200 rounded-lg hover:bg-earth-50 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-earth-200/50">
              <div>
                <label className="text-[10px] font-mono text-stone-400 tracking-widest uppercase block mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono bg-white border border-earth-200 rounded-lg text-earth-800 focus:outline-none focus:border-amber-500"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-stone-400 tracking-widest uppercase block mb-1">From</label>
                <select
                  value={filterRole}
                  onChange={e => setFilterRole(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono bg-white border border-earth-200 rounded-lg text-earth-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="All">All Users</option>
                  <option value="Students">Students Only</option>
                  <option value="Professors">Professors Only</option>
                </select>
              </div>
            </div>
          )}
        </BlueprintCard>

        {/* Feedback List */}
        <div className="space-y-3">
          {filteredFeedback.length > 0 ? (
            filteredFeedback.map(renderFeedbackCard)
          ) : (
            <BlueprintCard className="p-10 text-center">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm font-mono text-stone-400">No feedback matches your filters.</p>
            </BlueprintCard>
          )}
        </div>
      </div>
    );
  }

  // ─── STUDENT / PROFESSOR VIEW ───
  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-earth-800">Your Feedback</h2>
          <p className="text-xs font-mono text-stone-400 mt-0.5">Share your experience to help us improve CivilCraft</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-earth-700 to-earth-600 text-white text-xs font-mono font-bold rounded-lg hover:from-earth-800 hover:to-earth-700 transition-all tracking-wider uppercase"
          >
            <MessageSquare className="w-4 h-4" />
            Write Feedback
          </button>
        )}
      </div>

      {/* Success Toast */}
      {submitted && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-lg animate-fade-in-up">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <ThumbsUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Feedback Submitted!</p>
            <p className="text-xs text-emerald-600">Thank you for helping us improve CivilCraft.</p>
          </div>
        </div>
      )}

      {/* Feedback Form */}
      {showForm && (
        <BlueprintCard className="p-6 border-amber-300/50">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold font-mono text-earth-800 tracking-wide uppercase">New Feedback</h3>
            <button
              onClick={() => { setShowForm(false); setRating(0); setComment(''); }}
              className="text-xs font-mono text-stone-400 hover:text-earth-700 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Rating */}
          <div className="mb-5">
            <label className="text-[11px] font-mono text-stone-500 tracking-widest uppercase block mb-2">
              Overall Rating <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-stone-300'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="text-xs font-mono text-stone-500 ml-2">
                  {rating === 1 ? 'Poor' : rating === 2 ? 'Fair' : rating === 3 ? 'Good' : rating === 4 ? 'Very Good' : 'Excellent'}
                </span>
              )}
            </div>
          </div>

          {/* Category */}
          <div className="mb-5">
            <label className="text-[11px] font-mono text-stone-500 tracking-widest uppercase block mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {['Gameplay', 'Content', 'Platform', 'Difficulty', 'Learning', 'Bug Report', 'Suggestion'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                    category === cat
                      ? 'bg-earth-700 text-white border-earth-700'
                      : 'bg-white text-earth-600 border-earth-200 hover:border-earth-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div className="mb-5">
            <label className="text-[11px] font-mono text-stone-500 tracking-widest uppercase block mb-2">
              Your Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Tell us what you think about CivilCraft... What did you enjoy? What could be better?"
              rows={4}
              className="w-full px-4 py-3 text-sm bg-white border border-earth-200 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 resize-none text-earth-800 placeholder:text-stone-400"
            />
            <p className="text-[10px] font-mono text-stone-400 mt-1">{comment.length}/500 characters</p>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-stone-400">
              Submitting as <span className="text-earth-700 font-semibold">{user?.name ?? 'Anonymous'}</span>
              {' '}&middot;{' '}
              <span className={user?.role === 'professor' ? 'text-amber-600' : 'text-emerald-600'}>
                {user?.role === 'professor' ? 'Professor' : 'Student'}
              </span>
            </p>
            <button
              onClick={handleSubmit}
              disabled={rating === 0 || comment.trim() === ''}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-mono font-bold rounded-lg tracking-wider uppercase transition-all ${
                rating > 0 && comment.trim()
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-md'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              Submit Feedback
            </button>
          </div>
        </BlueprintCard>
      )}

      {/* My Past Submissions */}
      {myFeedbackList.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-earth-200/50" />
            <span className="text-[10px] font-mono text-stone-400 tracking-widest uppercase">Your Submissions</span>
            <div className="h-px flex-1 bg-earth-200/50" />
          </div>
          <div className="space-y-3">
            {myFeedbackList.map(renderFeedbackCard)}
          </div>
        </>
      )}

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-earth-200/50" />
        <span className="text-[10px] font-mono text-stone-400 tracking-widest uppercase">Community Feedback</span>
        <div className="h-px flex-1 bg-earth-200/50" />
      </div>

      {/* Community Feedback (read-only for students/profs) */}
      <div className="space-y-3">
        {allFeedback.map(renderFeedbackCard)}
      </div>
    </div>
  );
}
