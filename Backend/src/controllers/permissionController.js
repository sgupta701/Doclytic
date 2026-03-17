import DocumentPermission from '../models/DocumentPermission.js';
import Document from '../models/Document.js';

export const grantPermission = async (req, res) => {
  try {
    const { document_id, user_id, permission_level } = req.body;
    const doc = await Document.findById(document_id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.uploaded_by.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can grant permissions' });

    const perm = await DocumentPermission.findOneAndUpdate(
      { document_id, user_id },
      { permission_level, granted_by: req.userId },
      { upsert: true, new: true }
    );
    res.json(perm);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listPermissionsForDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.uploaded_by.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can view permissions' });

    const perms = await DocumentPermission.find({ document_id: documentId }).populate('user_id', 'email full_name');
    res.json(perms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const revokePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await DocumentPermission.findById(id);
    if (!existing) return res.status(404).json({ message: 'Permission not found' });

    const doc = await Document.findById(existing.document_id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.uploaded_by.toString() !== req.userId) {
      return res.status(403).json({ message: 'Only owner can revoke permissions' });
    }

    await DocumentPermission.deleteOne({ _id: id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
