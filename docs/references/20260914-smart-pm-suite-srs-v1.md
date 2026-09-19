# Tài liệu Đặc tả Yêu cầu Phần mềm (SRS) - Hệ thống Quản lý Dự án Thông minh (Smart PM Suite)

## 1. Giới thiệu Tổng quan và Tầm nhìn Chiến lược

Smart PM Suite không đơn thuần là một công cụ quản lý đầu việc; đây là một hệ điều hành quản trị dự án được thiết kế để hợp nhất tầng tác nghiệp thực tế và tầng quản trị chiến lược. Hệ thống này giải quyết bài toán cốt lõi của doanh nghiệp: sự sai lệch dữ liệu giữa báo cáo tiến độ và thực trạng tài chính.

Bằng cách áp dụng các thuật toán quản trị dự án chuẩn hóa theo PMBOK (như EVM, CPM và PERT), Smart PM Suite chuyển đổi các tương tác hàng ngày của đội ngũ thành các chỉ số sức khỏe dự án theo thời gian thực. Việc tích hợp này đảm bảo rằng mọi quyết định của cấp lãnh đạo đều dựa trên các thông số định lượng chính xác, từ đó tối ưu hóa chuỗi giá trị và giảm thiểu rủi ro vận hành.

## 2. Phân hệ Quản trị Tác nghiệp (Operational Task Management)

Phân hệ này đóng vai trò là "điểm chạm" dữ liệu đầu vào. Tính kỷ luật và độ chi tiết tại đây là yếu tố sống còn để đảm bảo độ tin cậy cho toàn bộ hệ thống báo cáo phía sau.

### Yêu cầu Chức năng:

- **Cấu trúc Công việc:** Hỗ trợ Checklist và Sub-tasks đa cấp.
- **Hệ thống Phê duyệt Công việc (Work Authorization System):** Hệ thống phải cưỡng ép quy trình: Task không được phép chuyển trạng thái "In Progress" hoặc ghi nhận tiến độ trừ khi có cờ "Work Authorization" được kích hoạt bởi Giám đốc dự án (PM) hoặc Quản lý chức năng.
- **Quản lý Sự phụ thuộc (Dependencies):** Đặc tả đầy đủ 4 loại liên kết mạng lưới (Network Diagram):
    - **FS (Finish-to-Start):** Phổ biến nhất, việc sau chỉ bắt đầu khi việc trước kết thúc.
    - **SS (Start-to-Start), FF (Finish-to-Finish), SF (Start-to-Finish).**
- **Lead & Lag Time:** Cho phép cài đặt thời gian chờ hoặc thời gian gối đầu giữa các nhiệm vụ dựa trên logic mạng lưới tiến độ.
- **Time-tracking:** Timesheet hàng ngày phải được phê duyệt để trở thành dữ liệu thô cho tính toán chi phí.

**Ý nghĩa quản trị (So What?):** Dữ liệu Time-tracking không chỉ để kiểm soát chuyên cần mà là tham số trực tiếp cấu thành **Actual Cost (AC)**. AC sẽ được đối chiếu với **Earned Value (EV)** để tính toán **Cost Variance (CV)**. Việc phát hiện sớm CV tại tầng tác nghiệp giúp ngăn chặn tình trạng "chảy máu" ngân sách trước khi quá muộn.

## 3. Quản trị Nguồn lực & Năng lực (Operational Resource Management)

Hệ thống tối ưu hóa việc phân bổ tài nguyên dựa trên năng lực thực tế và tính khả dụng của nhân sự.

### Yêu cầu Chức năng:

- **Resource Calendar:** Quản lý lịch làm việc, ca kíp và các ngày nghỉ lễ/nghỉ phép riêng biệt cho từng tài nguyên.
- **Skills Matrix & Smart Assignment:** Ma trận kỹ năng cho phép gán việc thông minh dựa trên trình độ chuyên môn.
- **Quản lý Đơn giá (Costing):** Cài đặt Billing Rate theo giờ/ngày cho tài nguyên để phục vụ tính toán ngân sách.

**Ý nghĩa quản trị (So What?):** Quản lý Resource Capacity giúp tránh tình trạng quá tải (Over-allocation). Theo logic PMP, hệ thống hỗ trợ PM đàm phán với Quản lý chức năng (Functional Manager) để thiết lập các ưu tiên lập lịch (Scheduling priorities), đảm bảo các dự án ưu tiên cao luôn có đủ tài nguyên tinh nhuệ.

## 4. Công cụ Lập lịch & Cấu trúc (WBS, PERT/CPM Engine)

Hệ thống cung cấp "trái tim" tính toán để thiết lập Đường cơ sở (Baseline) dự án.

### Yêu cầu Chức năng:

- **WBS Dictionary:** Yêu cầu hệ thống cho phép nhập Metadata tại các "Gói công việc" (Work Package - nút lá của cây WBS) bao gồm: Tiêu chuẩn nghiệm thu, người chịu trách nhiệm và mô tả chi tiết công việc. AC và EV phải được Roll-up từ Work Package lên cấp Control Account cao hơn.
- **PERT Engine:** Tính toán thời gian dự kiến (Expected Duration) theo công thức: E = (P + 4M + O) / 6.
- **Đường găng (Critical Path):** Tự động thực hiện Forward pass và Backward pass để xác định Đường găng và Float (độ phồng).
- **Rủi ro tiến độ cấp dự án:** Hệ thống phải tính toán Phương sai dự án bằng cách lấy căn bậc hai của tổng các phương sai của các tác vụ trên Đường găng: SD_{project} = \sqrt{\sum (\frac{P-O}{6})^2}.
- **Cảnh báo Hội tụ đường (Path Convergence):** Hệ thống phải tự động kích hoạt **Cảnh báo Rủi ro cao** tại các nút (Sinks) nơi có nhiều nhiệm vụ tiền nhiệm hội tụ, do rủi ro trễ tiến độ tại đây là rất lớn.

**Ý nghĩa quản trị (So What?):** Việc xác định hội tụ đường giúp PM tập trung kiểm soát các điểm nút nhạy cảm. Các nhiệm vụ có Float = 0 (thuộc Đường găng) sẽ được hệ thống ưu tiên hiển thị để bảo vệ tiến độ tổng thể.

## 5. Phân hệ Đo lường Earned Value Management (EVM) & Dashboard

Smart PM Suite sử dụng EVM làm ngôn ngữ chung để đánh giá sức khỏe dự án.

### Yêu cầu Chức năng:

Hệ thống tự động tính toán các chỉ số sức khỏe:

|   |   |   |
|---|---|---|
|Chỉ số|Công thức|Ý nghĩa Quản trị|
|**CV / SV**|EV - AC / EV - PV|Sai lệch Chi phí / Tiến độ (Dương là tốt)|
|**CPI / SPI**|EV / AC / EV / PV|Chỉ số hiệu quả ( < 1 là vượt ngân sách hoặc trễ hạn)|
|**TCPI**|(BAC - EV) / (BAC - AC)|Hiệu suất cần đạt để về đích đúng ngân sách Baseline|

- **Kịch bản Dự báo (Forecasting - EAC):** Hệ thống hỗ trợ 3 quy trình tính toán:
    1. **Biến động điển hình (Typical):** EAC = BAC / CPI.
    2. **Biến động bất thường (Atypical):** EAC = AC + BAC - EV.
    3. **Ước tính ban đầu bị sai (Flawed Estimate):** Hệ thống cung cấp workflow cho phép PM và Junior Engineers nhập lại dự toán từ dưới lên: EAC = AC + \text{Bottom-up ETC}.

**Ý nghĩa quản trị (So What?):** Nếu CPI < 1, dự án đang tiêu tiền nhanh hơn giá trị tạo ra. TCPI sẽ chỉ ra áp lực hiệu suất: nếu TCPI > 1, đội ngũ phải làm việc hiệu quả hơn mức bình thường để cứu vãn mục tiêu tài chính ban đầu.

## 6. Quản trị Rủi ro (Risk EMV) & Kiểm soát Chất lượng (QC)

### Yêu cầu Chức năng:

- **Risk Registry & EMV:** Tính toán Giá trị tiền tệ kỳ vọng: EMV = \text{Xác suất} \times \text{Tác động}.
- **Control Charts:** Hệ thống phải vẽ biểu đồ kiểm soát với các ngưỡng Sigma được **cài đặt cứng (Hard-coded)** theo tiêu chuẩn PMP: 1 Sigma (68.26%), 2 Sigma (95.46%), và 3 Sigma (99.73%).
- **Process Capability:** Module QC phải cho phép cấu hình song song cả Giới hạn kiểm soát (UCL/LCL - năng lực nội bộ) và Giới hạn đặc tả (USL/LSL - yêu cầu của khách hàng) để trực quan hóa năng lực quy trình.

**Ý nghĩa quản trị (So What?):** Việc phân biệt giữa Giới hạn kiểm soát và Giới hạn đặc tả giúp PM biết quy trình có đang ổn định hay không. Triết lý hệ thống đề cao "Phòng ngừa hơn Kiểm tra" (Prevention over Inspection) để giảm thiểu chi phí lỗi hỏng.

## 7. Quản trị Thay đổi (Change Control) & Mua sắm (Procurement)

### Yêu cầu Chức năng:

- **Workflow thay đổi:** Mọi yêu cầu thay đổi (CR) phải qua phê duyệt của Hội đồng kiểm soát thay đổi (CCB) trước khi hệ thống cập nhật Baseline mới.
- **PTA Tracker (Hợp đồng FPIF):** Hệ thống tính toán Điểm giả định tổng chi phí (Point of Total Assumption): PTA = \frac{\text{Ceiling Price} - \text{Target Price}}{\text{Buyer's Share Ratio}} + \text{Target Cost}
- **Cấu hình Share Ratio:** UI phải phân biệt rõ rệt giữa Tỷ lệ chia sẻ của Người mua (Buyer) và Người bán (Seller) để tránh sai sót trong công thức tính PTA.

**Ý nghĩa quản trị (So What?):** Chỉ số PTA cảnh báo thời điểm nhà thầu bắt đầu chịu mọi rủi ro về chi phí vượt mức, giúp PM kiểm soát rủi ro tài chính trong các hợp đồng thầu phụ.

## 8. Quản trị Danh mục (Portfolio) & Dashboard Lãnh đạo

Hỗ trợ lựa chọn dự án dựa trên các mô hình kinh tế (Economic Models).

### Yêu cầu Chức năng:

- **Chỉ số Tài chính:** NPV, IRR, BCR và Payback Period.
- **Logic Loại trừ Sunk Cost:** Trong Dashboard Portfolio, các thuật toán tính ROI và NPV phục vụ lựa chọn dự án **phải loại bỏ hoàn toàn Chi phí chìm (Sunk Costs)**. Hệ thống chỉ dựa trên các chi phí và lợi ích trong tương lai để hỗ trợ ra quyết định.
- **Phân tích Chi phí Cơ hội (Opportunity Cost):** So sánh giá trị dự án được chọn với dự án có NPV cao nhất không được chọn.

**Ý nghĩa quản trị (So What?):** Việc bỏ qua Chi phí chìm giúp lãnh đạo tránh được "Ngụy biện chi phí chìm" (Sunk Cost Fallacy), đảm bảo nguồn vốn được đổ vào những dự án thực sự sinh lời thay vì cố cứu vãn những dự án đã thất bại.

## 9. Yêu cầu Phi chức năng & Tích hợp

- **Bảo mật & RBAC:** Phân quyền nghiêm ngặt theo vai trò, đặc biệt là dữ liệu nhạy cảm về đơn giá tài nguyên và ngân sách dự án.
- **Toàn vẹn dữ liệu (Data Integrity):** Đảm bảo các phép tính toán học phức tạp không bị sai lệch khi xử lý khối lượng tác vụ lớn.
- **Tích hợp API:** Khả năng kết nối với hệ thống kế toán/ERP để cập nhật Actual Cost (AC) tự động.

**Kết luận:** Smart PM Suite chuyển đổi cách thức quản trị từ cảm tính sang quản trị dựa trên dữ liệu (Data-driven). Bằng cách cưỡng ép các quy trình PMP vào tính năng phần mềm, hệ thống đảm bảo dự án luôn đi đúng hướng trên cả ba phương diện: Phạm vi, Tiến độ và Chi phí.