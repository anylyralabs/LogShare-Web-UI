package cn.logshare.sdk;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LogShare.CN Java SDK
 * 适配 LogShare API v1.8.5+（纯文件模型、按文件分析）。
 *
 * JSON 接口返回原始响应字符串，调用方可使用 Jackson / Gson 等库解析。
 *
 * @version 3.1.0
 */
public class LogShareSDK {

    public static class LogShareException extends Exception {
        private final int status;
        private final String body;

        public LogShareException(String message, String code, int status, String body) {
            super(message);
            this.status = status;
            this.body = body;
        }

        public int getStatus() {
            return status;
        }

        public String getBody() {
            return body;
        }
    }

    private final String baseUrl;
    private final Duration timeout;
    private final HttpClient httpClient;
    private final Map<String, String> defaultHeaders;

    public LogShareSDK() {
        this(new LinkedHashMap<>());
    }

    public LogShareSDK(Map<String, Object> options) {
        this.baseUrl = String.valueOf(options.getOrDefault("baseUrl", "https://api.logshare.cn"))
                .replaceAll("/$", "");
        this.timeout = Duration.ofSeconds(((Number) options.getOrDefault("timeout", 120)).longValue());
        this.defaultHeaders = new LinkedHashMap<>();
        this.defaultHeaders.put("Accept", "application/json");
        this.defaultHeaders.put("User-Agent", "LogShare-Java-SDK/3.1.0");
        Object headers = options.get("headers");
        if (headers instanceof Map) {
            for (Object entry : ((Map<?, ?>) headers).entrySet()) {
                Map.Entry<?, ?> kv = (Map.Entry<?, ?>) entry;
                this.defaultHeaders.put(String.valueOf(kv.getKey()), String.valueOf(kv.getValue()));
            }
        }
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /** 上传文件列表。files 为 [{name,content}]，metadata 为 [{key,value,label?,visible?}]。 */
    public String submit(
            List<Map<String, Object>> files,
            List<Map<String, Object>> metadata,
            String source
    ) throws LogShareException {
        if (files == null || files.isEmpty()) {
            throw new LogShareException("至少需要一个文件", "VALIDATION_ERROR", 0, null);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("files", files);
        if (metadata != null) body.put("metadata", metadata);
        if (source != null && !source.isEmpty()) body.put("source", source);
        return request("/v1/log", "POST", toJson(body), null);
    }

    public String submit(List<Map<String, Object>> files) throws LogShareException {
        return submit(files, null, null);
    }

    /** 兼容旧调用名；参数为文件数组。 */
    public String paste(List<Map<String, Object>> files) throws LogShareException {
        return submit(files);
    }

    /** 获取文件列表与日志元信息。 */
    public String getMeta(String id) throws LogShareException {
        validateId(id);
        return request("/v1/log/" + encodePath(id), "GET", null, null);
    }

    /** 单文件日志的 Codex 分析；多文件请用 getInsightsFile。 */
    public String getInsights(String id) throws LogShareException {
        validateId(id);
        return request("/v1/insights/" + encodePath(id), "GET", null, null);
    }

    /** 指定文件的 Codex 分析。 */
    public String getInsightsFile(String id, String filename) throws LogShareException {
        validateId(id);
        return request(
                "/v1/insights/" + encodePath(id) + "/" + encodeFilePath(filename),
                "GET",
                null,
                null
        );
    }

    /** 单文件日志原文；多文件请用 getRawFile。 */
    public String getRaw(String id) throws LogShareException {
        validateId(id);
        return request("/v1/raw/" + encodePath(id), "GET", null, "text/plain");
    }

    /** 指定文件原文；filename 支持子路径。 */
    public String getRawFile(String id, String filename) throws LogShareException {
        validateId(id);
        return request(
                "/v1/raw/" + encodePath(id) + "/" + encodeFilePath(filename),
                "GET",
                null,
                "text/plain"
        );
    }

    /** 获取上传限制。 */
    public String getLimits() throws LogShareException {
        return request("/v1/limits", "GET", null, null);
    }

    /** 删除一个或多个日志。 */
    public String delete(String[] ids, String token) throws LogShareException {
        if (ids == null || ids.length == 0) {
            throw new LogShareException("日志 ID 不能为空", "VALIDATION_ERROR", 0, null);
        }
        List<String> encoded = new ArrayList<>();
        for (String id : ids) {
            validateId(id);
            encoded.add(encodePath(id));
        }
        Map<String, String> headers = new LinkedHashMap<>();
        if (token != null && !token.isEmpty()) {
            headers.put("Authorization", "Bearer " + token);
        }
        return request("/v1/log/" + String.join(",", encoded), "DELETE", null, null, headers);
    }

    public String delete(String id, String token) throws LogShareException {
        return delete(new String[] { id }, token);
    }

    public static boolean isValidId(String id) {
        return id != null && id.matches("^[A-Za-z0-9]{7}$");
    }

    private void validateId(String id) throws LogShareException {
        if (!isValidId(id)) {
            throw new LogShareException("日志 ID 格式无效", "VALIDATION_ERROR", 0, null);
        }
    }

    private String request(String path, String method, String body, String accept)
            throws LogShareException {
        return request(path, method, body, accept, null);
    }

    private String request(
            String path,
            String method,
            String body,
            String accept,
            Map<String, String> extraHeaders
    ) throws LogShareException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(timeout);

        Map<String, String> headers = new LinkedHashMap<>(defaultHeaders);
        if (extraHeaders != null) headers.putAll(extraHeaders);
        if (accept != null) headers.put("Accept", accept);
        headers.forEach(builder::header);

        if (body != null) {
            builder.header("Content-Type", "application/json");
            builder.method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        } else if ("DELETE".equals(method)) {
            builder.DELETE();
        } else {
            builder.GET();
        }

        HttpResponse<String> response;
        try {
            response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new LogShareException("网络请求失败: " + e.getMessage(), "NETWORK_ERROR", 0, null);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LogShareException("请求被中断", "INTERRUPTED", 0, null);
        }

        String responseBody = response.body();
        if (response.statusCode() >= 400) {
            throw new LogShareException(
                    extractError(responseBody, response.statusCode()),
                    "HTTP_ERROR",
                    response.statusCode(),
                    responseBody
            );
        }
        return responseBody;
    }

    private static String extractError(String body, int status) {
        if (body != null) {
            String key = "\"error\"";
            int index = body.indexOf(key);
            if (index >= 0) {
                int start = body.indexOf('"', index + key.length());
                if (start >= 0) {
                    StringBuilder value = new StringBuilder();
                    for (int i = start + 1; i < body.length(); i++) {
                        char c = body.charAt(i);
                        if (c == '\\' && i + 1 < body.length()) {
                            value.append(body.charAt(++i));
                        } else if (c == '"') {
                            return value.toString();
                        } else {
                            value.append(c);
                        }
                    }
                }
            }
        }
        return "HTTP " + status;
    }

    private static String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String encodeFilePath(String filename) {
        String[] parts = filename.split("/");
        StringBuilder path = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) path.append('/');
            path.append(encodePath(parts[i]));
        }
        return path.toString();
    }

    private static String toJson(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return '"' + escape((String) value) + '"';
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map) {
            StringBuilder out = new StringBuilder("{");
            boolean first = true;
            for (Object entry : ((Map<?, ?>) value).entrySet()) {
                Map.Entry<?, ?> kv = (Map.Entry<?, ?>) entry;
                if (!first) out.append(',');
                first = false;
                out.append('"').append(escape(String.valueOf(kv.getKey()))).append("\":")
                        .append(toJson(kv.getValue()));
            }
            return out.append('}').toString();
        }
        if (value instanceof Iterable) {
            StringBuilder out = new StringBuilder("[");
            boolean first = true;
            for (Object item : (Iterable<?>) value) {
                if (!first) out.append(',');
                first = false;
                out.append(toJson(item));
            }
            return out.append(']').toString();
        }
        return '"' + escape(String.valueOf(value)) + '"';
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
