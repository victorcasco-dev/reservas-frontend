<%@ page contentType="application/json; charset=UTF-8" session="true" trimDirectiveWhitespaces="true" %><%
    // Identifica el Tomcat de UI que atendió el pedido (jvmRoute) y cuenta pedidos en la sesión.
    // El contador vive en la sesión HTTP, que el cluster replica: si se cae un nodo, el otro continúa la cuenta.
    response.setHeader("Cache-Control", "no-store");
    Integer hits = (Integer) session.getAttribute("hits");
    hits = hits == null ? 1 : hits + 1;
    session.setAttribute("hits", hits);   // setAttribute dispara la replicación delta
    String node = System.getProperty("ui.node", "desconocido");
    String id = session.getId();
    int dot = id.indexOf('.');
    String baseId = dot > 0 ? id.substring(0, dot) : id;
%>{"node":"<%= node %>","sessionId":"<%= baseId %>","route":"<%= dot > 0 ? id.substring(dot + 1) : "" %>","hits":<%= hits %>,"created":<%= session.getCreationTime() %>}
