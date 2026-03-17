import mongoose from "mongoose";

const buckets = new Map();
const readyPromises = new Map();

const getOrCreateBucket = (bucketName) => {
  if (!mongoose.connection.db) return null;
  if (!buckets.has(bucketName)) {
    buckets.set(
      bucketName,
      new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName })
    );
    console.log(`GridFS initialized for bucket: ${bucketName}`);
  }
  return buckets.get(bucketName);
};

mongoose.connection.on("connected", () => {
  getOrCreateBucket("mailUploads");
});

export const getGFS = async (bucketName = "mailUploads") => {
  const existing = getOrCreateBucket(bucketName);
  if (existing) return existing;

  if (!readyPromises.has(bucketName)) {
    readyPromises.set(
      bucketName,
      new Promise((resolve, reject) => {
        mongoose.connection.once("connected", () =>
          resolve(getOrCreateBucket(bucketName))
        );
        mongoose.connection.once("error", (err) => reject(err));
      })
    );
  }

  return readyPromises.get(bucketName);
};
