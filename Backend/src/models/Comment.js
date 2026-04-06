import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parent_comment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  content: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('Comment', CommentSchema);
