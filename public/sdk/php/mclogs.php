<?php

/**
 * LogShare.CN PHP SDK
 * 适配 LogShare API v1.8.5+（纯文件模型、按文件分析）
 *
 * @version 3.1.0
 * @license MIT
 */

declare(strict_types=1);

namespace LogShare;

use Exception;

class LogShareException extends Exception
{
    private ?string $errorCode;
    private ?int $httpStatus;
    private ?string $responseBody;

    public function __construct(
        string $message,
        ?string $errorCode = null,
        ?int $httpStatus = null,
        ?string $responseBody = null
    ) {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
        $this->responseBody = $responseBody;
    }

    public function getErrorCode(): ?string
    {
        return $this->errorCode;
    }

    public function getHttpStatus(): ?int
    {
        return $this->httpStatus;
    }

    public function getResponseBody(): ?string
    {
        return $this->responseBody;
    }
}

class LogShareSDK
{
    private string $baseUrl;
    private int $timeout;
    private int $connectTimeout;
    /** @var array<string, string> */
    private array $headers;
    /** @var callable|null */
    private $errorHandler;

    public function __construct(array $options = [])
    {
        $this->baseUrl = rtrim($options['baseUrl'] ?? 'https://api.logshare.cn', '/');
        $this->timeout = (int) ($options['timeout'] ?? 120);
        $this->connectTimeout = (int) ($options['connectTimeout'] ?? 10);
        $this->headers = array_merge([
            'Accept' => 'application/json',
            'User-Agent' => 'LogShare-PHP-SDK/3.1.0'
        ], $options['headers'] ?? []);
        $this->errorHandler = $options['errorHandler'] ?? null;
    }

    /**
     * 上传日志文件列表。
     *
     * @param array<int, array{name: string, content: string}> $files
     * @param array<int, array{key: string, value: mixed, label?: string, visible?: bool}>|null $metadata
     */
    public function submit(
        array $files,
        ?array $metadata = null,
        ?string $source = null
    ): array {
        if ($files === []) {
            throw new LogShareException('至少需要一个文件', 'VALIDATION_ERROR');
        }
        $body = ['files' => $files];
        if ($metadata !== null) {
            $body['metadata'] = $metadata;
        }
        if ($source !== null) {
            $body['source'] = $source;
        }

        return $this->request('/v1/log', 'POST', $body);
    }

    /** 兼容旧调用名；参数为文件数组。 */
    public function paste(array $files, ?array $metadata = null, ?string $source = null): array
    {
        return $this->submit($files, $metadata, $source);
    }

    /** 获取文件列表与日志元信息。 */
    public function getMeta(string $id): array
    {
        $this->validateId($id);
        return $this->request('/v1/log/' . rawurlencode($id));
    }

    /** 单文件日志的 Codex 分析；多文件请用 getInsightsFile。 */
    public function getInsights(string $id): array
    {
        $this->validateId($id);
        return $this->request('/v1/insights/' . rawurlencode($id));
    }

    /** 指定文件的 Codex 分析。 */
    public function getInsightsFile(string $id, string $filename): array
    {
        $this->validateId($id);
        $path = implode('/', array_map('rawurlencode', explode('/', $filename)));
        return $this->request('/v1/insights/' . rawurlencode($id) . '/' . $path);
    }

    /** 单文件日志原文；多文件请用 getRawFile。 */
    public function getRaw(string $id): string
    {
        $this->validateId($id);
        return $this->requestRaw('/v1/raw/' . rawurlencode($id), 'GET', null, ['Accept' => 'text/plain']);
    }

    /** 指定文件原文；filename 支持子路径。 */
    public function getRawFile(string $id, string $filename): string
    {
        $this->validateId($id);
        $path = implode('/', array_map('rawurlencode', explode('/', $filename)));
        return $this->requestRaw(
            '/v1/raw/' . rawurlencode($id) . '/' . $path,
            'GET',
            null,
            ['Accept' => 'text/plain']
        );
    }

    /** 获取上传限制。 */
    public function getLimits(): array
    {
        return $this->request('/v1/limits');
    }

    /**
     * 删除日志。
     *
     * @param string|string[] $id
     */
    public function delete($id, ?string $token = null): array
    {
        $ids = is_array($id) ? $id : [$id];
        foreach ($ids as $item) {
            $this->validateId($item);
        }
        $path = implode(',', array_map('rawurlencode', $ids));
        $headers = [];
        if ($token !== null && $token !== '') {
            $headers['Authorization'] = 'Bearer ' . $token;
        }
        return $this->request('/v1/log/' . $path, 'DELETE', null, $headers);
    }

    public static function isValidId(string $id): bool
    {
        return preg_match('/^[A-Za-z0-9]{7}$/', $id) === 1;
    }

    private function validateId(string $id): void
    {
        if (!self::isValidId($id)) {
            throw new LogShareException('日志 ID 格式无效', 'VALIDATION_ERROR');
        }
    }

    private function request(string $path, string $method = 'GET', ?array $body = null, array $headers = []): array
    {
        $response = $this->requestRaw($path, $method, $body, $headers);
        $data = json_decode($response, true);
        if (!is_array($data)) {
            throw new LogShareException('响应不是有效 JSON', 'JSON_ERROR', 0, $response);
        }
        if (($data['success'] ?? true) === false) {
            $message = $data['error'] ?? $data['message'] ?? 'API 请求失败';
            $this->handleError(new LogShareException($message, 'API_ERROR', null, $response));
        }
        return $data;
    }

    private function requestRaw(string $path, string $method = 'GET', ?array $body = null, array $headers = []): string
    {
        $ch = curl_init($this->baseUrl . $path);
        $allHeaders = array_merge($this->headers, $headers);
        $headerLines = [];
        foreach ($allHeaders as $key => $value) {
            $headerLines[] = $key . ': ' . $value;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_ENCODING => ''
        ]);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? [], JSON_UNESCAPED_UNICODE));
            curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headerLines, ['Content-Type: application/json']));
        } elseif ($method === 'DELETE') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
        }

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->handleError(new LogShareException('网络请求失败: ' . $curlError, 'NETWORK_ERROR'));
        }

        if ($status >= 400) {
            $data = json_decode($response, true);
            $message = is_array($data)
                ? ($data['error'] ?? $data['message'] ?? 'HTTP ' . $status)
                : ('HTTP ' . $status);
            $this->handleError(new LogShareException($message, 'HTTP_ERROR', $status, $response));
        }

        return $response;
    }

    private function handleError(LogShareException $error): void
    {
        if (is_callable($this->errorHandler)) {
            ($this->errorHandler)($error);
        }
        throw $error;
    }
}
