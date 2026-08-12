<?php

namespace App\Services\Entries;

use App\Services\FileRequests\HandleFileRequestUpload;
use Common\Files\FileEntry;

class DriveUploadHandler
{
    public function handle(FileEntry $entry, array $data): FileEntry
    {
        if (request('fileRequest')) {
            return (new HandleFileRequestUpload())->execute($entry, $data);
        }

        if (request()->has('encryption_iv')) {
            $entry->encryption_iv = request('encryption_iv');
            $entry->encryption_key = request('encryption_key');
            $entry->save();
        }

        return $entry;
    }
}
