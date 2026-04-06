import Comment from '../models/Comment.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { sendNotification } from '../utils/sendNotification.js';

const userHasDocumentAccess = async (documentId, userId, doc = null) => {
  const targetDoc = doc || await Document.findById(documentId);
  if (!targetDoc) return { hasAccess: false, doc: null };
  return { hasAccess: true, doc: targetDoc };
};

const notifyCommentParticipants = async ({ doc, actorId, comment, isReply }) => {
  const recipientIds = new Set();

  const allUsers = await User.find({}).select('_id');
  allUsers.forEach((user) => recipientIds.add(user._id.toString()));

  recipientIds.delete(actorId);

  await Promise.all(
    [...recipientIds].map((recipientId) =>
      sendNotification(
        recipientId,
        isReply
          ? `A new reply was added to the discussion on "${doc.title}".`
          : `A new comment was added to "${doc.title}".`,
        'info',
        {
          title: isReply ? 'New Comment Reply' : 'New Document Comment',
          document_id: doc._id,
        }
      )
    )
  );
};

const serializeComment = (comment) => {
  const raw = comment?.toObject ? comment.toObject() : comment;
  const author = raw?.user_id && typeof raw.user_id === 'object' ? raw.user_id : null;

  return {
    ...raw,
    user_id: author?._id?.toString?.() || raw.user_id?.toString?.() || raw.user_id,
    parent_comment_id: raw?.parent_comment_id?.toString?.() || raw?.parent_comment_id || null,
    profile: {
      full_name: author?.full_name || 'Unknown User',
      email: author?.email || '',
      avatar_url: author?.avatar_url || '',
    },
  };
};

export const addComment = async (req, res) => {
  try {
    const { document_id, content, parent_comment_id } = req.body;
    const doc = await Document.findById(document_id);
    if (!doc) return res.status(404).json({ message: 'Doc not found' });

    const { hasAccess } = await userHasDocumentAccess(document_id, req.userId, doc);
    if (!hasAccess) return res.status(403).json({ message: 'No access' });

    if (parent_comment_id) {
      const parentComment = await Comment.findOne({ _id: parent_comment_id, document_id });
      if (!parentComment) return res.status(404).json({ message: 'Parent comment not found' });
    }

    const comment = await Comment.create({
      document_id,
      user_id: req.userId,
      parent_comment_id: parent_comment_id || null,
      content
    });
    const populatedComment = await Comment.findById(comment._id)
      .populate('user_id', 'email full_name avatar_url')
      .lean();
    await notifyCommentParticipants({
      doc,
      actorId: req.userId,
      comment,
      isReply: Boolean(parent_comment_id),
    });
    res.json(serializeComment(populatedComment || comment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listComments = async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: 'Doc not found' });

    const { hasAccess } = await userHasDocumentAccess(documentId, req.userId, doc);
    if (!hasAccess) return res.status(403).json({ message: 'No access' });

    const comments = await Comment.find({ document_id: documentId })
      .populate('user_id', 'email full_name avatar_url')
      .sort({ createdAt: 1 });
    res.json(comments.map(serializeComment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
