using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace LogShare.CN.SDK
{
    /// <summary>LogShare SDK 异常。</summary>
    public class LogShareException : Exception
    {
        public int StatusCode { get; }
        public string? Body { get; }

        public LogShareException(string message, int statusCode = 0, string? body = null) : base(message)
        {
            StatusCode = statusCode;
            Body = body;
        }
    }

    public class LogShareOptions
    {
        public string BaseUrl { get; set; } = "https://api.logshare.cn";
        public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(120);
        public Dictionary<string, string> Headers { get; set; } = new();
    }

    /// <summary>
    /// LogShare.CN .NET SDK
    /// 适配 LogShare API v1.8.5+（纯文件模型、按文件分析）。
    /// </summary>
    public class LogShareSDK : IDisposable
    {
        private readonly string _baseUrl;
        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, string> _defaultHeaders;

        public LogShareSDK(LogShareOptions? options = null)
        {
            options ??= new LogShareOptions();
            _baseUrl = options.BaseUrl.TrimEnd('/');
            _defaultHeaders = new Dictionary<string, string>(options.Headers)
            {
                ["User-Agent"] = "LogShare-DotNet-SDK/3.1.0"
            };
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip
                    | DecompressionMethods.Deflate
                    | DecompressionMethods.Brotli
            };
            _httpClient = new HttpClient(handler) { Timeout = options.Timeout };
        }

        /// <summary>上传文件列表。files 为 [{name,content}]，metadata 为 [{key,value,label?,visible?}]。</summary>
        public Task<JsonElement> SubmitAsync(
            List<Dictionary<string, string>> files,
            List<Dictionary<string, object?>>? metadata = null,
            string? source = null,
            CancellationToken cancellationToken = default)
        {
            if (files == null || files.Count == 0)
                throw new LogShareException("至少需要一个文件");

            var body = new Dictionary<string, object?> { ["files"] = files };
            if (metadata != null) body["metadata"] = metadata;
            if (!string.IsNullOrEmpty(source)) body["source"] = source;
            return RequestJsonAsync("/v1/log", HttpMethod.Post, body, null, cancellationToken);
        }

        /// <summary>兼容旧调用名；参数为文件数组。</summary>
        public Task<JsonElement> PasteAsync(
            List<Dictionary<string, string>> files,
            CancellationToken cancellationToken = default)
        {
            return SubmitAsync(files, null, null, cancellationToken);
        }

        /// <summary>获取文件列表与日志元信息。</summary>
        public Task<JsonElement> GetMetaAsync(string id, CancellationToken cancellationToken = default)
        {
            ValidateId(id);
            return RequestJsonAsync($"/v1/log/{EncodePath(id)}", HttpMethod.Get, null, null, cancellationToken);
        }

        /// <summary>单文件日志的 Codex 分析；多文件请用 GetInsightsFileAsync。</summary>
        public Task<JsonElement> GetInsightsAsync(string id, CancellationToken cancellationToken = default)
        {
            ValidateId(id);
            return RequestJsonAsync($"/v1/insights/{EncodePath(id)}", HttpMethod.Get, null, null, cancellationToken);
        }

        /// <summary>指定文件的 Codex 分析。</summary>
        public Task<JsonElement> GetInsightsFileAsync(
            string id,
            string filename,
            CancellationToken cancellationToken = default)
        {
            ValidateId(id);
            return RequestJsonAsync(
                $"/v1/insights/{EncodePath(id)}/{EncodeFilePath(filename)}",
                HttpMethod.Get,
                null,
                null,
                cancellationToken
            );
        }

        /// <summary>单文件日志原文；多文件请用 GetRawFileAsync。</summary>
        public Task<string> GetRawAsync(string id, CancellationToken cancellationToken = default)
        {
            ValidateId(id);
            return RequestTextAsync($"/v1/raw/{EncodePath(id)}", cancellationToken);
        }

        /// <summary>指定文件原文；filename 支持子路径。</summary>
        public Task<string> GetRawFileAsync(
            string id,
            string filename,
            CancellationToken cancellationToken = default)
        {
            ValidateId(id);
            return RequestTextAsync(
                $"/v1/raw/{EncodePath(id)}/{EncodeFilePath(filename)}",
                cancellationToken
            );
        }

        /// <summary>获取上传限制。</summary>
        public Task<JsonElement> GetLimitsAsync(CancellationToken cancellationToken = default)
        {
            return RequestJsonAsync("/v1/limits", HttpMethod.Get, null, null, cancellationToken);
        }

        /// <summary>删除一个或多个日志。</summary>
        public Task<JsonElement> DeleteAsync(
            string token,
            CancellationToken cancellationToken = default,
            params string[] ids)
        {
            if (ids == null || ids.Length == 0)
                throw new LogShareException("日志 ID 不能为空");

            foreach (var id in ids) ValidateId(id);
            var path = string.Join(',', ids.Select(EncodePath));
            return RequestJsonAsync($"/v1/log/{path}", HttpMethod.Delete, null, token, cancellationToken);
        }

        public static bool IsValidId(string id)
        {
            return !string.IsNullOrEmpty(id)
                && System.Text.RegularExpressions.Regex.IsMatch(id, "^[A-Za-z0-9]{7}$");
        }

        private static void ValidateId(string id)
        {
            if (!IsValidId(id)) throw new LogShareException("日志 ID 格式无效");
        }

        private async Task<JsonElement> RequestJsonAsync(
            string path,
            HttpMethod method,
            Dictionary<string, object?>? body,
            string? token,
            CancellationToken cancellationToken)
        {
            var response = await SendAsync(path, method, body, token, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            try
            {
                using var document = JsonDocument.Parse(content);
                return document.RootElement.Clone();
            }
            catch (JsonException)
            {
                throw new LogShareException("响应不是有效 JSON", (int)response.StatusCode, content);
            }
        }

        private async Task<string> RequestTextAsync(string path, CancellationToken cancellationToken)
        {
            var response = await SendAsync(
                path,
                HttpMethod.Get,
                null,
                null,
                cancellationToken,
                "text/plain"
            );
            return await response.Content.ReadAsStringAsync(cancellationToken);
        }

        private async Task<HttpResponseMessage> SendAsync(
            string path,
            HttpMethod method,
            Dictionary<string, object?>? body,
            string? token,
            CancellationToken cancellationToken,
            string accept = "application/json")
        {
            var request = new HttpRequestMessage(method, _baseUrl + path);
            foreach (var header in _defaultHeaders)
            {
                if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) continue;
                if (header.Key.Equals("Accept", StringComparison.OrdinalIgnoreCase)) continue;
                request.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
            request.Headers.Accept.Clear();
            request.Headers.Accept.ParseAdd(accept);
            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
            if (body != null)
            {
                request.Content = new StringContent(
                    JsonSerializer.Serialize(body),
                    Encoding.UTF8,
                    "application/json"
                );
            }

            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode) return response;

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            var message = ExtractError(content) ?? $"HTTP {(int)response.StatusCode}";
            throw new LogShareException(message, (int)response.StatusCode, content);
        }

        private static string? ExtractError(string content)
        {
            try
            {
                using var document = JsonDocument.Parse(content);
                var root = document.RootElement;
                if (root.TryGetProperty("error", out var error)) return error.GetString();
                if (root.TryGetProperty("message", out var message)) return message.GetString();
            }
            catch (JsonException)
            {
                // ignore
            }
            return null;
        }

        private static string EncodePath(string value)
        {
            return Uri.EscapeDataString(value);
        }

        private static string EncodeFilePath(string filename)
        {
            return string.Join('/', filename.Split('/').Select(EncodePath));
        }

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }
}
