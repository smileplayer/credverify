# CONTRIBUTIONS

## Thông tin

| Hạng mục | Nội dung |
|---|---|
| Đề tài | CredVerify — Hệ thống cấp phát và xác minh chứng chỉ khóa học trên blockchain |
| Hình thức | Cá nhân |
| Họ và tên | Tạ Minh Đức |
| MSSV | 25520343 |
| Giảng viên hướng dẫn | Trần Tuấn Dũng |
| Repository | https://github.com/smileplayer/credverify |

## Tuyên bố đóng góp

Đề tài được đăng ký và thực hiện theo hình thức cá nhân. Toàn bộ 100% khối lượng công việc
do sinh viên nêu trên tự thực hiện, bao gồm: khảo sát vấn đề, nghiên cứu tài liệu, thiết kế
kiến trúc, viết smart contract, viết bộ kiểm thử, xây dựng giao diện, thu thập bằng chứng,
viết báo cáo và chuẩn bị trình bày.

## Phân rã công việc

| # | Hạng mục | Sản phẩm | Minh chứng |
|---|---|---|---|
| 1 | Khảo sát vấn đề, xác định stakeholder và phạm vi | Phiếu đăng ký đề tài | `01_PhieuDangKy.docx` |
| 2 | Nghiên cứu tài liệu, phân tích related work | Comparison matrix trong proposal | `02_Proposal.docx` mục 2 |
| 3 | Thiết kế baseline tập trung và lập luận chọn blockchain | Bảng so sánh 6 tiêu chí | `02_Proposal.docx` mục 2.1 |
| 4 | Thiết kế state machine và phân loại on-chain/off-chain | Bảng phân loại dữ liệu | `02_Proposal.docx` mục 3.3, 4 |
| 5 | Xây dựng threat model | Bảng tác nhân — abuse case — biện pháp | `02_Proposal.docx` mục 5 |
| 6 | Cài đặt smart contract | `CredentialRegistry.sol` | commit `[điền hash]` |
| 7 | Viết bộ kiểm thử tự động | [điền số] test case | commit `[điền hash]` |
| 8 | Xây dựng giao diện web | `app/index.html` — 4 màn hình | commit `[điền hash]` |
| 9 | Tự động hóa thu thập bằng chứng | `scripts/collect-evidence.js` | commit `[điền hash]` |
| 10 | Kiểm thử bảo mật, phân tích static analysis | Kết quả Slither và giải thích | `EVIDENCE.md` mục 9 |
| 11 | Đo hiệu năng và chi phí | Bảng gas, độ trễ, so sánh baseline | `EVIDENCE.md` mục 4, báo cáo mục 12 |
| 12 | Viết báo cáo cuối kỳ | Báo cáo [điền số] trang | `01_Report.pdf` |
| 13 | Chuẩn bị slide và video demo | [điền số] slide, video [điền] phút | `02_Slides.pdf`, `demo/` |

## Sử dụng công cụ hỗ trợ

Sinh viên có sử dụng công cụ hỗ trợ lập trình và tra cứu trong quá trình thực hiện, cụ thể:

| Công cụ | Mục đích sử dụng | Phạm vi |
|---|---|---|

Sinh viên chịu trách nhiệm kiểm chứng toàn bộ nội dung. Không có nội dung nào do công cụ
sinh ra được sử dụng như một nguồn tài liệu tham khảo. Mọi trích dẫn trong báo cáo đều dẫn
tới nguồn gốc có thể kiểm chứng và đã được đối chiếu trực tiếp.

## Cam kết

Sinh viên cam kết:

- Toàn bộ số liệu trong báo cáo khớp với log và kết quả kiểm thử thực tế, không có số liệu bịa đặt.
- Mọi bằng chứng trong `EVIDENCE.md` đều tái lập được theo hướng dẫn trong `README.md`.
- Không sao chép mã nguồn hoặc nội dung của người khác mà không ghi rõ nguồn và giấy phép.
- Không có private key, seed phrase hay dữ liệu cá nhân thật trong repository.