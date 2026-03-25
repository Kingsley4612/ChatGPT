import { useEffect, useState } from 'react';
import { datasetService } from '../../services/dataset.service';
import type { DatasetMeta, DatasetPageRequest, DatasetPageResponse } from '../../types/models';

interface UseDatasetRequest extends Omit<DatasetPageRequest, 'datasetId'> {
  reloadKey?: number;
}

export function useDataset(datasetId: string, req: UseDatasetRequest) {
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [page, setPage] = useState<DatasetPageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    datasetService.getDatasetMeta(datasetId).then(setMeta).catch((e: Error) => setError(e.message));
  }, [datasetId, req.reloadKey]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    datasetService
      .getDatasetPage({ datasetId, ...req })
      .then(setPage)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [datasetId, req.page, req.pageSize, req.sortBy, req.sortOrder, req.keyword, JSON.stringify(req.filters), req.reloadKey]);

  return { meta, page, loading, error };
}
